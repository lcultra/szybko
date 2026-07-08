export interface ShortcutApplicationService {
  registerDefaults(): Promise<void>;
}

export interface WindowApplicationService {
  toggleMainWindow(): void;
  show(): void;
  hide(): void;
  resize(height: number): void;
}
