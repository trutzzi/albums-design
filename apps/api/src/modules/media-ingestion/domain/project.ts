import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";

export type ProjectType = "WEDDING" | "BAPTISM" | "EVENT";

export interface ProjectProps {
  studioId: UniqueEntityId;
  name: string;
  type: ProjectType;
  eventDate: Date | undefined;
  createdAt: Date;
}

export class Project extends AggregateRoot<ProjectProps> {
  private constructor(props: ProjectProps, id: UniqueEntityId) {
    super(props, id);
  }

  static create(
    props: { studioId: UniqueEntityId; name: string; type: ProjectType; eventDate?: Date },
    id?: UniqueEntityId,
  ): Project {
    return new Project(
      {
        studioId: props.studioId,
        name: props.name,
        type: props.type,
        eventDate: props.eventDate,
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

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
