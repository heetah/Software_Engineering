const { myFunction, anotherFunction } = require('../src/myModule');

test('myFunction should do something', () => {
  expect(myFunction()).toBe(expectedValue);
});

test('anotherFunction should do something else', () => {
  expect(anotherFunction()).toBe(anotherExpectedValue);
});
