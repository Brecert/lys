(module
 (type $none_=>_i32 (func (result i32)))
 (type $f32_f32_=>_f32 (func (param f32 f32) (result f32)))
 (type $none_=>_none (func))
 (type $i32_=>_i32 (func (param i32) (result i32)))
 (type $i32_i32_=>_i32 (func (param i32 i32) (result i32)))
 (type $f32_f64_=>_f32 (func (param f32 f64) (result f32)))
 (memory $0 1)
 (data (i32.const 21) "\08\00\00\00t\00r\00u\00e")
 (data (i32.const 34) "\n\00\00\00f\00a\00l\00s\00e")
 (data (i32.const 49) "\02\00\00\000")
 (data (i32.const 56) "\02\00\00\000")
 (global $global$0 (mut i32) (i32.const 0))
 (export "memory" (memory $0))
 (export "test_getMaxMemory" (func $0))
 (export "test" (func $2))
 (export "test0" (func $2))
 (export "testa" (func $1))
 (export "floatingPoints" (func $3))
 (export "addFloat" (func $4))
 (export "addInts" (func $5))
 (export "x" (func $6))
 (start $7)
 (func $0 (result i32)
  (global.get $global$0)
 )
 (func $1 (param $0 i32) (result i32)
  (local.get $0)
 )
 (func $2 (result i32)
  (i32.const 1)
 )
 (func $3 (param $0 f32) (param $1 f64) (result f32)
  (local.get $0)
 )
 (func $4 (param $0 f32) (param $1 f32) (result f32)
  (f32.add
   (local.get $0)
   (local.get $1)
  )
 )
 (func $5 (param $0 i32) (param $1 i32) (result i32)
  (i32.add
   (local.get $0)
   (local.get $1)
  )
 )
 (func $6 (param $0 f32) (param $1 f32) (result f32)
  (f32.mul
   (f32.add
    (local.get $0)
    (f32.const 1)
   )
   (local.get $1)
  )
 )
 (func $7
  (global.set $global$0
   (i32.const 65536)
  )
 )
)
