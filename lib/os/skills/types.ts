export type SkillProvenance = 'company' | 'command' | 'pack' | 'global';

export type SkillStatus = 'live' | 'learning' | 'planned';

export type CatalogSkill = {
  id: string;
  name: string;
  description: string;
  category: string;
  provenance: SkillProvenance;
  provenanceLabel: string;
  filePath: string;
  isEditable: boolean;
  status?: SkillStatus;
  markdown?: string;
};

export const CATEGORY_ORDER = [
  'Engineering',
  'Operations',
  'Sales',
  'Content',
  'Commands',
  'General',
];
