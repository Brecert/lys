(module
  (export "fib" (func $fib))
  (func $fibo (param $n i32) (param $a i32) (param $b i32) (result i32)
    (local $var$3 i32)
    (block $B1 (result i32)
      (set_local $var$3 (get_local $n))
      (block $B1_0
          (block $B1_1
              (block $B1_2
                  (br_if $B1_0 (i32.eq (i32.const 0) (get_local $var$3)))
                  (br_if $B1_1 (i32.eq (i32.const 1) (get_local $var$3)))
                )
              (call $fibo (i32.sub (get_local $n) (i32.const 1)) (get_local $b) (i32.add (get_local $a) (get_local $b)))
              (br $B1)
            )
          (get_local $b)
          (br $B1)
        )
      (get_local $a)
      (br $B1)
    )
  )
  (func $fib (param $n i32) (result i32)
    (call $fibo (get_local $n) (i32.const 0) (i32.const 1))
  )
)
