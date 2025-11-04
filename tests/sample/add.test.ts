// 範例：簡單的加法測試
import { describe, expect, test } from "@jest/globals";

// 使用 describe 來分組相關的測試
describe("sample math helper", () => {
  // 在 describe 區塊中定義要測試的函式
  const add = (a: number, b: number): number => {
    return a + b; // 回傳兩個數字相加的結果
  };

  // 使用 test 來撰寫單一的測試案例
  test("should sum two numbers correctly", () => {
    const result = add(2, 3); // 呼叫 add 函式並傳入參數

    expect(result).toBe(5); // 檢查結果是否等於 5
  });
});
