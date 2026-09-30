import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";

export type StudioRole = "OWNER" | "EDITOR" | "VIEWER";

export interface StudioMemberProps {
  studioId: UniqueEntityId;
  email: string;
  name: string;
  role: StudioRole;
  invitedAt: Date;
  acceptedAt: Date | undefined;
  /** Set once the member has real login credentials — an invite alone never has one. */
  passwordHash: string | undefined;
  /** When the member proved they own the address. A self-serve signup cannot log in before it. */
  emailVerifiedAt: Date | undefined;
}

const EDIT_ROLES: readonly StudioRole[] = ["OWNER", "EDITOR"];

export class StudioMember extends AggregateRoot<StudioMemberProps> {
  private constructor(props: StudioMemberProps, id: UniqueEntityId) {
    super(props, id);
  }

  static invite(
    params: { studioId: UniqueEntityId; email: string; name: string; role: StudioRole },
    id?: UniqueEntityId,
  ): StudioMember {
    return new StudioMember(
      {
        studioId: params.studioId,
        email: params.email,
        name: params.name,
        role: params.role,
        invitedAt: new Date(),
        acceptedAt: undefined,
        passwordHash: undefined,
        emailVerifiedAt: undefined,
      },
      id ?? UniqueEntityId.create(),
    );
  }

  /** A self-serve signup: it has a password, but logs in only once its email is confirmed. */
  static signUp(
    params: { studioId: UniqueEntityId; email: string; name: string; passwordHash: string },
    id?: UniqueEntityId,
  ): StudioMember {
    const member = StudioMember.invite(
      { studioId: params.studioId, email: params.email, name: params.name, role: "OWNER" },
      id,
    );
    member.props.passwordHash = params.passwordHash;
    member.props.acceptedAt = new Date();
    return member;
  }

  static reconstitute(props: StudioMemberProps, id: UniqueEntityId): StudioMember {
    return new StudioMember(props, id);
  }

  get studioId(): UniqueEntityId {
    return this.props.studioId;
  }

  get email(): string {
    return this.props.email;
  }

  get name(): string {
    return this.props.name;
  }

  get role(): StudioRole {
    return this.props.role;
  }

  get invitedAt(): Date {
    return this.props.invitedAt;
  }

  get acceptedAt(): Date | undefined {
    return this.props.acceptedAt;
  }

  get canEdit(): boolean {
    return EDIT_ROLES.includes(this.props.role);
  }

  get passwordHash(): string | undefined {
    return this.props.passwordHash;
  }

  get emailVerifiedAt(): Date | undefined {
    return this.props.emailVerifiedAt;
  }

  get emailVerified(): boolean {
    return this.props.emailVerifiedAt !== undefined;
  }

  markEmailVerified(at: Date = new Date()): void {
    if (!this.props.emailVerifiedAt) this.props.emailVerifiedAt = at;
  }

  /** Someone signing up again before confirming: the newest details win, still unconfirmed. */
  restartSignUp(params: { name: string; passwordHash: string }): void {
    this.props.name = params.name;
    this.props.passwordHash = params.passwordHash;
  }

  accept(): void {
    this.props.acceptedAt = new Date();
  }

  setPassword(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
    if (!this.props.acceptedAt) this.props.acceptedAt = new Date();
  }

  changeRole(role: StudioRole): void {
    if (this.props.role === "OWNER" && role !== "OWNER") {
      throw new Error("Transfer ownership before demoting the studio owner.");
    }
    this.props.role = role;
  }
}
