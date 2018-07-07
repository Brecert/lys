import { Nodes, findNodesByType } from '../parser/nodes';
import { FunctionType } from '../parser/types';
import { findBuiltInTypedBinaryOperation } from './languageOperations';
import { annotations } from '../parser/annotations';
import { findParentType } from '../parser/phases/helpers';
import * as t from '@webassemblyjs/ast';
import { print } from '@webassemblyjs/wast-printer';
import * as binaryen from 'binaryen';

import * as wabt from 'wabt';
import { flatten } from '../parser/helpers';

declare var WebAssembly;

const secSymbol = Symbol('secuentialId');
function getModuleSecuentialId(module) {
  let num = module[secSymbol] || 0;
  num++;
  module[secSymbol] = num;
  return num;
}

function getTypeForFunction(fn: Nodes.FunctionNode) {
  const ret = fn.functionReturnType.ofType;

  const retType = ret.binaryenType ? [ret.binaryenType] : [];

  return t.signature(
    fn.parameters.map($ => ({
      id: $.parameterName.name,
      valtype: $.ofType.binaryenType
    })),
    retType
  );
}

function emitFunction(fn: Nodes.FunctionNode, document: Nodes.DocumentNode) {
  const fnType = getTypeForFunction(fn);

  const locals = fn.additionalLocals.map($ =>
    t.instruction('local', [t.identifier($.name), t.valtypeLiteral($.type.binaryenType)])
  );

  const moduleFun = t.func(
    t.identifier(fn.internalIdentifier), // name
    fnType, //signature
    [...locals, ...emitList(fn.body, document)] // body
  );

  return moduleFun;
}

function emitTailCall(node: Nodes.TailRecLoopNode, document: Nodes.DocumentNode) {
  const label = 'TailCallLoop' + getModuleSecuentialId(document);
  node.annotate(new annotations.LabelId(label));
  return t.loopInstruction(t.identifier(label), void 0, emitList(node.body, document));
}

function emitFunctionCall(node: Nodes.FunctionCallNode, document: Nodes.DocumentNode) {
  if (node.hasAnnotation(annotations.IsTailRecCall)) {
    const tailCallLoopNode = findParentType(node, Nodes.TailRecLoopNode);

    const fn = findParentType(node, Nodes.FunctionNode);

    const setArgsStatements = node.argumentsNode.map(($, $$) => {
      return t.instruction('set_local', [t.identifier(fn.localsByIndex[$$].name), emit($, document)]);
    });

    const labelAnnotation = tailCallLoopNode.getAnnotation(annotations.LabelId);

    setArgsStatements.push(t.instruction('br', [t.identifier(labelAnnotation.label)]));

    return setArgsStatements;
  } else {
    const ofType = node.functionNode.ofType as FunctionType;

    return t.callInstruction(t.identifier(ofType.internalName), node.argumentsNode.map($ => emit($, document)));
  }
}

function emitMatchingNode(match: Nodes.MatchNode, document: Nodes.DocumentNode) {
  const matchers = match.matchingSet.slice(0);
  const ixDefaultBranch = matchers.findIndex($ => $ instanceof Nodes.MatchDefaultNode);
  const lhs = t.instruction('set_local', [t.identifier(match.local.name), emit(match.lhs, document)]);

  if (ixDefaultBranch !== -1) {
    // the default branch must be the last element
    const defaultMatcher = matchers[ixDefaultBranch];
    matchers.splice(ixDefaultBranch, 1);
    matchers.push(defaultMatcher);
  }

  const blocks = matchers
    .map(function emitNode(node: Nodes.MatcherNode): { condition; body; type } {
      if (node instanceof Nodes.MatchDefaultNode) {
        const body = emit(node.rhs, document);
        return { condition: null, body, type: node.rhs.ofType.binaryenType };
      } else if (node instanceof Nodes.MatchLiteralNode) {
        const condition = findBuiltInTypedBinaryOperation('==', node.literal.ofType, match.lhs.ofType);

        const body = emit(node.rhs, document);
        return {
          condition: condition.generateCode(
            emit(node.literal, document),
            t.instruction('get_local', [t.identifier(match.local.name)])
          ),
          body,
          type: node.rhs.ofType.binaryenType
        };
      }
    })
    .filter($ => !!$);
  const exitBlock = 'B' + getModuleSecuentialId(document);
  const exitLabel = t.identifier(exitBlock);

  const breaks = blocks
    .filter($ => !!$.condition)
    .map(($, $$) => t.instruction('br_if', [t.identifier(`${exitBlock}_${$$}`), $.condition]));

  const ret = blocks.reduceRight((prev, curr, ix) => {
    //    if (ix == blocks.length - 1) return flatten([prev, curr.body]);

    const label = t.identifier(`${exitBlock}_${ix}`);
    const newBlock = t.blockInstruction(label, flatten(prev), curr.type.binaryenType);

    const ret = flatten([newBlock, curr.body]);

    ret.push(t.instruction('br', [exitLabel]));

    return ret;
  }, breaks);

  return t.blockInstruction(t.identifier(exitBlock), flatten([lhs, ret]), match.ofType.binaryenType);
}

function emitList(nodes: Nodes.Node[] | Nodes.Node, document: Nodes.DocumentNode) {
  if (nodes instanceof Array) {
    return flatten(nodes.map($ => emit($, document)));
  } else {
    return flatten([emit(nodes, document)]);
  }
}

function emit(node: Nodes.Node, document: Nodes.DocumentNode): any {
  function _emit() {
    // try {
    if (node instanceof Nodes.FunctionCallNode) {
      return emitFunctionCall(node, document);
    } else if (node instanceof Nodes.IntegerLiteral) {
      return t.objectInstruction('const', 'i32', [t.numberLiteralFromRaw(node.value)]);
    } else if (node instanceof Nodes.BooleanLiteral) {
      return t.objectInstruction('const', 'i32', [t.numberLiteralFromRaw(node.value ? 0xffffffff : 0)]);
    } else if (node instanceof Nodes.FloatLiteral) {
      return t.objectInstruction('const', 'f32', [t.numberLiteralFromRaw(node.value)]);
    } else if (node instanceof Nodes.MatchNode) {
      return emitMatchingNode(node, document);
    } else if (node instanceof Nodes.TailRecLoopNode) {
      return emitTailCall(node, document);
    } else if (node instanceof Nodes.GetLocalNode) {
      return t.instruction('get_local', [t.identifier(node.local.name)]);
    } else if (node instanceof Nodes.VarDeclarationNode) {
      return t.instruction('set_local', [t.identifier(node.local.name), emit(node.value, document)]);
    } else if (node instanceof Nodes.AssignmentNode) {
      return t.instruction('set_local', [t.identifier(node.variableName.variable.name), emit(node.value, document)]);
    } else if (node instanceof Nodes.BlockNode) {
      // if (!node.label) throw new Error('Block node without label');
      const label = t.identifier(node.label || 'unknown_block_' + getModuleSecuentialId(document));
      const type = node.ofType.binaryenType;
      let instr = [];

      node.statements.forEach($ => {
        instr = instr.concat(emit($, document));
      });

      if (instr.length == 0) {
        instr.push(t.instruction('nop'));
      }

      return t.blockInstruction(label, instr, type);
    } else if (node instanceof Nodes.IfNode) {
      return t.ifInstruction(
        t.identifier('a_wild_if'),
        [emit(node.condition, document)],
        node.ofType.binaryenType,
        emitList(node.truePart, document),
        node.falsePart ? emitList(node.falsePart, document) : []
      );
    } else if (node instanceof Nodes.BinaryExpressionNode) {
      return node.binaryOperation.generateCode(emit(node.lhs, document), emit(node.rhs, document));
    } else if (node instanceof Nodes.VariableReferenceNode) {
      // const decl = node.closure.getVariable(node.variable.name).node;

      return t.instruction('get_local', [t.identifier(node.variable.name)]);
    }

    throw new Error(`This node cannot be emited ${node.nodeName}`);
    // } catch (e) {
    //   node.errors.push(e);
    // }
  }

  const generatedNode = _emit();

  if (!generatedNode) throw new Error(`Could not emit any code for node ${node.nodeName}`);

  const retAnnotation = node.getAnnotation(annotations.IsReturnExpression);

  if (retAnnotation) {
    if (retAnnotation.targetLocal !== null) {
      return t.instruction('set_local', [t.identifier(retAnnotation.targetLocal.name), generatedNode]);
    } else {
      return t.instruction('return', [generatedNode]);
    }
  }

  return generatedNode;
}

export async function compileModule(document: Nodes.DocumentNode) {
  const functions = findNodesByType(document, Nodes.OverloadedFunctionNode);

  const createdFunctions = [];
  const exportedFunctions = [];

  functions.forEach($ => {
    const canBeExported = $.functions.length === 1;

    $.functions.forEach(fun => {
      createdFunctions.push(emitFunction(fun.functionNode, document));
      if (fun.isExported) {
        if (canBeExported) {
          exportedFunctions.push(
            t.moduleExport(
              fun.functionNode.functionName.name,
              t.moduleExportDescr('Func', t.identifier(fun.functionNode.internalIdentifier))
            )
          );
        } else {
          throw new Error('You cannot export overloaded functions');
        }
      }
    });
  });

  const module = t.module(null, [...exportedFunctions, ...createdFunctions]);
  const program = t.program([module]);

  return {
    program,
    document
  };
}

export async function validateModule(x: { program: any; document: Nodes.DocumentNode }) {
  let text = print(x.program);

  await wabt.ready;

  const wabtModule = wabt.parseWat(x.document.file || 'main.ro', text);

  wabtModule.resolveNames();
  wabtModule.validate();

  const compiled = wabtModule.toBinary({ log: false });

  const module = binaryen.readBinary(compiled.buffer);

  if (module.validate() == 0) {
    throw new Error('binaryen validation failed');
  }

  return { ...x, text, module, buffer: compiled.buffer };
}

export async function generateBinary(x: {
  program: any;
  document: Nodes.DocumentNode;
  text: string;
  buffer: Uint8Array;
}) {
  // Create the imports for the module, including the
  // standard dynamic library imports
  const imports = {
    env: {
      memoryBase: 0,
      tableBase: 0,
      memory: new WebAssembly.Memory({ initial: 256 }),
      table: new WebAssembly.Table({ initial: 0, element: 'anyfunc' })
    }
  };

  // Create the instance.
  const compiled = await WebAssembly.compile(x.buffer);

  return new WebAssembly.Instance(compiled, imports);
}
