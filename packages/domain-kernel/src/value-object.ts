export abstract class ValueObject<Props extends object> {
  protected readonly props: Props;

  protected constructor(props: Props) {
    this.props = Object.freeze(props);
  }

  equals(other: ValueObject<Props> | undefined): boolean {
    if (other === undefined) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
