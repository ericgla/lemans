class A {
  foo() {
    console.log('foo');
  }
}

class B extends A{
  bar() {
    console.log('bar');
  }
}

const b = new B();

b.foo();