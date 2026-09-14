export class Result<T, E = string> {
  private constructor(
    private readonly ok: boolean,
    private readonly value: T | undefined,
    private readonly error: E | undefined,
  ) {}

  static success<T, E = string>(value: T): Result<T, E> {
    return new Result<T, E>(true, value, undefined);
  }

  static failure<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  get isSuccess(): boolean {
    return this.ok;
  }

  get isFailure(): boolean {
    return !this.ok;
  }

  getValue(): T {
    if (!this.ok) {
      throw new Error("Cannot get the value of a failed result.");
    }
    return this.value as T;
  }

  getError(): E {
    if (this.ok) {
      throw new Error("Cannot get the error of a successful result.");
    }
    return this.error as E;
  }
}
