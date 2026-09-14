import { ValueObject, type UniqueEntityId } from "@albumflow/domain-kernel";

interface StorageKeyProps {
  key: string;
}

export class StorageKey extends ValueObject<StorageKeyProps> {
  private constructor(props: StorageKeyProps) {
    super(props);
  }

  static forOriginal(params: {
    studioId: UniqueEntityId;
    projectId: UniqueEntityId;
    photoId: UniqueEntityId;
    fileName: string;
  }): StorageKey {
    const extension = params.fileName.includes(".")
      ? params.fileName.slice(params.fileName.lastIndexOf(".") + 1).toLowerCase()
      : "bin";
    const key = [
      "studios",
      params.studioId.toString(),
      "projects",
      params.projectId.toString(),
      "originals",
      `${params.photoId.toString()}.${extension}`,
    ].join("/");
    return new StorageKey({ key });
  }

  static fromExisting(key: string): StorageKey {
    return new StorageKey({ key });
  }

  toString(): string {
    return this.props.key;
  }
}
