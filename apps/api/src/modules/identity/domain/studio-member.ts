import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";

export type StudioRole = "OWNER" | "EDITOR" | "VIEWER";

export interface StudioMemberProps {
  studioId: UniqueEntityId;
  email: string;
  name: string;
  role: StudioRole;
  invitedAt: Date;
  acceptedAt: Date | undefined;
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
      },
      id ?? UniqueEntityId.create(),
    );
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

  accept(): void {
    this.props.acceptedAt = new Date();
  }

  changeRole(role: StudioRole): void {
    if (this.props.role === "OWNER" && role !== "OWNER") {
      throw new Error("Transfer ownership before demoting the studio owner.");
    }
    this.props.role = role;
  }
}
