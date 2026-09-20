import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";

export type ProjectType = "WEDDING" | "BAPTISM" | "EVENT";

export interface ProjectProps {
  studioId: UniqueEntityId;
  name: string;
  type: ProjectType;
  eventDate: Date | undefined;
  /** Who the shoot is for. Every client link prefills from these, so they are typed once per shoot. */
  clientName: string | undefined;
  clientEmail: string | undefined;
  createdAt: Date;
}

export class Project extends AggregateRoot<ProjectProps> {
  private constructor(props: ProjectProps, id: UniqueEntityId) {
    super(props, id);
  }

  static create(
    props: {
      studioId: UniqueEntityId;
      name: string;
      type: ProjectType;
      eventDate?: Date;
      clientName?: string | undefined;
      clientEmail?: string | undefined;
    },
    id?: UniqueEntityId,
  ): Project {
    return new Project(
      {
        studioId: props.studioId,
        name: props.name,
        type: props.type,
        eventDate: props.eventDate,
        clientName: props.clientName,
        clientEmail: props.clientEmail,
        createdAt: new Date(),
      },
      id ?? UniqueEntityId.create(),
    );
  }

  static reconstitute(props: ProjectProps, id: UniqueEntityId): Project {
    return new Project(props, id);
  }

  get studioId(): UniqueEntityId {
    return this.props.studioId;
  }

  get name(): string {
    return this.props.name;
  }

  get type(): ProjectType {
    return this.props.type;
  }

  get eventDate(): Date | undefined {
    return this.props.eventDate;
  }

  get clientName(): string | undefined {
    return this.props.clientName;
  }

  get clientEmail(): string | undefined {
    return this.props.clientEmail;
  }

  /**
   * Remembers who this shoot is for. Called when a link is created with a name or address,
   * so the next link prefills instead of asking again. A blank value leaves what is stored
   * alone — creating a link without an email must not wipe one that is already known.
   */
  rememberClient(contact: { name?: string | undefined; email?: string | undefined }): void {
    const name = contact.name?.trim();
    const email = contact.email?.trim();
    if (name) this.props.clientName = name;
    if (email) this.props.clientEmail = email;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
