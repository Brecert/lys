(module
  (export "outer" (func $outer))
  (func $x (param $x i32) (result i32)
    (get_local $x)
  )
  (func $x1 (param $x f32) (result f32)
    (get_local $x)
  )
  (func $outer (result i32)
    (call $x (i32.const 1))
  )
)
