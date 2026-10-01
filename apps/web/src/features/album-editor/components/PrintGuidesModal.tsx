import { CUSTOM_PROFILE_ID, type PrintGuides } from "@/features/album-editor/hooks/usePrintGuides";

/** Picks the print profile the editor's trim and safe-area guides are drawn from. */
export function PrintGuidesModal({ guides }: { guides: PrintGuides }) {
  const close = () => guides.setModalOpen(false);
  const choose = (profileId: string) => {
    guides.setProfileId(profileId);
    close();
  };
  return (
    <div className="modal-overlay" role="presentation" onClick={close}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guides-profile-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="guides-profile-title">Choose a print profile</h2>
        <p>
          The trim line and safe-area guides come from a print profile's bleed and margin — pick the one this album
          will actually be printed with.
        </p>
        {guides.profiles.isLoading && <p className="muted">Loading print profiles…</p>}
        <ul className="print-profile-options">
          {(guides.profiles.data ?? []).map((profile) => (
            <li key={profile.id}>
              <button
                type="button"
                className={`print-profile-option ${
                  guides.selected?.id === profile.id ? "print-profile-option--selected" : ""
                }`}
                onClick={() => choose(profile.id)}
              >
                <strong>{profile.name}</strong>
                <span className="muted">
                  {profile.bleedMm}mm bleed · {profile.safeMarginMm}mm safe margin
                </span>
              </button>
            </li>
          ))}
          <li>
            <div
              className={`print-profile-option print-profile-option--custom ${
                guides.profileId === CUSTOM_PROFILE_ID ? "print-profile-option--selected" : ""
              }`}
            >
              <strong>Custom</strong>
              <div className="print-profile-custom-fields">
                <label>
                  Bleed (mm)
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={guides.customBleedMm}
                    onChange={(event) => guides.setCustomBleedMm(Math.max(0, Number(event.target.value)))}
                  />
                </label>
                <label>
                  Safe margin (mm)
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={guides.customSafeMarginMm}
                    onChange={(event) => guides.setCustomSafeMarginMm(Math.max(0, Number(event.target.value)))}
                  />
                </label>
              </div>
              <button type="button" className="button button--small" onClick={() => choose(CUSTOM_PROFILE_ID)}>
                Use custom
              </button>
            </div>
          </li>
        </ul>
        <div className="modal__actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
