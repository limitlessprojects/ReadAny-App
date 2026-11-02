declare module "@tauri-apps/plugin-window-state" {
  export enum StateFlags {
    SIZE = 1,
    POSITION = 2,
    MAXIMIZED = 4,
    VISIBLE = 8,
    DECORATIONS = 16,
    FULLSCREEN = 32,
    ALL = 63,
  }

  export function saveWindowState(flags?: StateFlags): Promise<void>;
  export function restoreStateCurrent(flags?: StateFlags): Promise<void>;
  export function restoreState(label: string, flags?: StateFlags): Promise<void>;
  export function filename(): Promise<string>;
}
