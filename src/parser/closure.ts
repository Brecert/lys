import { Nodes } from './nodes';

export interface IDictionary<T> {
  [key: string]: T;
}

export interface IOverloadedInfix {
  [operator: string]: {
    [lhs: number]: {
      [rhs: number]: {
        fn: Nodes.FunDirectiveNode;
        directive: Nodes.DirectiveNode;
        executionContext: Context;
      };
    };
  };
}

export enum EStoredName {
  VARIABLE,
  TYPE,
  FUNCTION
}

export interface ITapeElement {
  frame: Closure;
  type: EStoredName;
  node: Nodes.Node;
  usages: number;
  exported: boolean;
}

export class Context {}

export class Closure {
  localsMap: Map<Nodes.Node, number> = new Map();

  localScopeDeclares: Set<string> = new Set();
  nameMappings: IDictionary<ITapeElement> = {};
  localUsages: IDictionary<number> = {};

  programTakenNames = new Set<string>();

  constructor(public executionContext: Context, public parent: Closure = null) {
    if (parent) {
      Object.assign(this.nameMappings, parent.nameMappings);
    }
  }

  getInternalIdentifier(node: Nodes.Node) {
    let prefix = 'identifier_';

    if (node instanceof Nodes.FunctionNode) {
      prefix = node.functionName.name || 'anonFun';
    }

    let i = 0;
    while (true) {
      const newName = i ? `${prefix}${i}` : prefix;
      if (!this.programTakenNames.has(newName)) {
        this.programTakenNames.add(newName);
        return newName;
      }
      i++;
    }
  }

  setVariable(localName: string, node: Nodes.Node) {
    return this.tapeSet(localName, node, EStoredName.VARIABLE);
  }

  setType(localName: string, node: Nodes.Node) {
    return this.tapeSet(localName, node, EStoredName.TYPE);
  }

  incrementUsage(name: string) {
    const x = this.get(name);
    this.localUsages[name] = (this.localUsages[name] || 0) + 1;
    x.usages++;
  }

  private tapeSet(localName: string, node: Nodes.Node, type: EStoredName) {
    if (localName in this.localUsages && this.localUsages[localName] > 0) {
      throw new Error(`Cannot reasign ${localName} because it was used`);
    }

    if (this.localScopeDeclares.has(localName)) {
      throw new Error(`"${localName}" is already declared`);
    }

    this.nameMappings[localName] = {
      type,
      node,
      frame: this,
      exported: false,
      usages: 0
    };

    this.localScopeDeclares.add(localName);

    return this.nameMappings[localName];
  }

  canResolveName(localName: string) {
    return localName in this.nameMappings;
  }

  get(localName: string): ITapeElement {
    if (localName in this.nameMappings) {
      return this.nameMappings[localName];
    }

    throw new Error('Cannot resolve name "' + localName + '"');
  }

  getType(localName: string) {
    let namedItem = this.get(localName);

    if (namedItem.type == EStoredName.TYPE) {
      return namedItem;
    }

    throw new Error(`Variable "${localName}" is not a type`);
  }

  getVariable(name: string) {
    let ret = this.get(name);

    return ret;
  }

  inspect() {
    return (
      'Clojure [' +
      '\n  ' +
      Object.keys(this.nameMappings).join('\n  ') +
      '\n  parent = ' +
      (this.parent ? '\n' + this.parent.inspect().replace(/^(.*)/gm, '    $1') : 'null') +
      '\n]'
    );
  }

  newChildClosure(): Closure {
    const child = new Closure(this.executionContext, this);
    child.programTakenNames = this.programTakenNames;
    return child;
  }
}
