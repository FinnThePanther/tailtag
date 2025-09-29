export type EditableSocialLink = {
  id: string;
  label: string;
  url: string;
};

export const SOCIAL_LINK_LIMIT = 5;

export const createEmptySocialLink = (): EditableSocialLink => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  label: '',
  url: '',
});

export const mapEditableSocialLinks = (links: { label: string; url: string }[]) =>
  links.map((link) => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label: link.label,
    url: link.url,
  }));
