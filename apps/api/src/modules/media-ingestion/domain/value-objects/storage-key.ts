import { ValueObject, type UniqueEntityId } from "@albumflow/domain-kernel";

interface StorageKeyProps {
  key: string;
}

/** `thumb` fills the photo tray and the layout chips; `preview` fills a spread slot. */
export type DerivativeVariant = "thumb" | "preview";

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

  /**
   * The display-sized copy that sits beside the original. Browsers must never be
   * handed a 20-megapixel camera file to draw a 96-pixel thumbnail, so every photo
   * gets small JPEG derivatives and the original is reserved for printing.
   */
  derivative(variant: DerivativeVariant): StorageKey {
    const withoutExtension = this.props.key.replace(/\.[^./]+$/, "");
    const key = `${withoutExtension.replace("/originals/", "/derivatives/")}-${variant}.jpg`;
    return new StorageKey({ key });
  }

  toString(): string {
    return this.props.key;
  }
}
