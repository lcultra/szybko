import type { InputContextSnapshot, TriggerMatch } from '@szybko/shared';
import type { CommandSearchRow } from '../../persistence/sqlite/repositories/command-projection-repository';

export interface Matcher {
    type: string;
    match: (snapshot: InputContextSnapshot, triggers: CommandSearchRow[]) => TriggerMatch[];
}
