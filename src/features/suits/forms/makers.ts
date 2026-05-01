export const FURSUIT_MAKER_LIMIT = 10;

export type EditableFursuitMaker = {
  id: string;
  name: string;
};

export type FursuitMakerToSave = {
  maker_name: string;
  normalized_maker_name: string;
  position: number;
};

export function normalizeFursuitMakerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function createEmptyFursuitMaker(): EditableFursuitMaker {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: '',
  };
}

export function createInitialFursuitMakers(): EditableFursuitMaker[] {
  return [createEmptyFursuitMaker()];
}

export function fursuitMakersToSave(makers: EditableFursuitMaker[]): FursuitMakerToSave[] {
  return makers
    .map((maker) => maker.name.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((makerName, index) => ({
      maker_name: makerName,
      normalized_maker_name: normalizeFursuitMakerName(makerName),
      position: index + 1,
    }));
}

export function hasDuplicateFursuitMakers(makers: FursuitMakerToSave[]): boolean {
  const seen = new Set<string>();

  for (const maker of makers) {
    if (seen.has(maker.normalized_maker_name)) {
      return true;
    }

    seen.add(maker.normalized_maker_name);
  }

  return false;
}
