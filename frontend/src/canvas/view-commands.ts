/** What the keyboard can ask of the view of the canvas, registered by the canvas while it is shown. */
export interface ViewCommands {
  /** Shows the whole diagram. */
  fit: () => void;
  /** Shows the selected node, or the chosen ones. */
  zoomToSelection: () => void;
}

let registered: ViewCommands | null = null;

/** Makes `commands` the ones the shortcuts use; the returned function takes them back. */
export function registerViewCommands(commands: ViewCommands): () => void {
  registered = commands;
  return () => {
    if (registered === commands) registered = null;
  };
}

export function viewCommands(): ViewCommands | null {
  return registered;
}
