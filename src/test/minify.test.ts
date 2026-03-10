import * as assert from 'assert';
import { minifyCpp } from '../extension';

suite('minifyCpp', () => {
  test('minifies the sample program', () => {
    const input = `#import <ios>
int main(int c, char **v)
{
    for (c = 0, puts("Hello, World!");; c < 10 ? printf("%d\\n", c++) : puts(*++v))
        ;
}
`;
    const expected = '#import<ios>\nint main(int c,char**v){for(c=0,puts("Hello, World!");;c<10?printf("%d\\n",c++):puts(*++v));}';
    assert.strictEqual(minifyCpp(input), expected);
  });

  test('removes line and block comments', () => {
    const input = `int a = 1; // comment
int b = 2; /* block */ int c = 3;`;
    const expected = 'int a=1;int b=2;int c=3;';
    assert.strictEqual(minifyCpp(input), expected);
  });

  test('preserves preprocessor line breaks', () => {
    const input = `int a = 0;
// comment
#define X 1
int b = X;`;
    const expected = 'int a=0;\n#define X 1\nint b=X;';
    assert.strictEqual(minifyCpp(input), expected);
  });

  test('avoids merging + + into ++', () => {
    const input = 'int x = 1 + +2;';
    const expected = 'int x=1+ +2;';
    assert.strictEqual(minifyCpp(input), expected);
  });

  test('preserves raw string contents', () => {
    const input = 'auto s = R"(a // b /* c */)";';
    const expected = 'auto s=R"(a // b /* c */)";';
    assert.strictEqual(minifyCpp(input), expected);
  });
});
