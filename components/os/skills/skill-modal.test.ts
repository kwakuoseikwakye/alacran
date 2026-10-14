import { describe, it, expect } from 'vitest';
import { tree } from "@/lib/test/element-tree";
import { SkillModal, PureMarkdown } from './skill-modal';
import type { CatalogSkill } from '@/lib/os/skills/types';

describe('SkillModal', () => {
  it('exports SkillModal component function', () => {
    expect(typeof SkillModal).toBe('function');
  });

  it('instantiates modal tree with skill props and accessibility attributes', () => {
    const mockSkill: CatalogSkill = {
      id: 'verify',
      name: 'verify',
      description: 'Run health check',
      category: 'Commands',
      provenance: 'command',
      provenanceLabel: 'Commands',
      filePath: '/path/to/verify.md',
      isEditable: true,
      markdown: '# Verify Command\nRuns verify.',
    };

    let closed = false;
    const element = tree(SkillModal({
      skill: mockSkill,
      companyId: 'test-co',
      onClose: () => { closed = true; },
    }));
    expect(element).toBeDefined();
    expect(element.type).toBe('div');
    expect(element.props.className).toContain('fixed inset-0');
    expect(element.props.role).toBe('dialog');
    expect(element.props['aria-modal']).toBe('true');
    expect(element.props['aria-label']).toBe('verify documentation');
    expect(closed).toBe(false);
  });

  it('renders PureMarkdown with headers, code fences, lists, and formatting', () => {
    const md = `# Title\n## Subtitle\n### Section\n---\n* Bullet point\n\`\`\`bash\nnpm test\n\`\`\`\nSome **bold** and \`code\` text.`;
    const element = tree(PureMarkdown({ src: md }));
    expect(element).toBeDefined();
    expect(element.props.className).toBe('space-y-1');
  });

  it('normalizes CRLF line endings in PureMarkdown cleanly', () => {
    const crlf = '# CRLF Title\r\n## Section\r\n---\r\n* Item 1\r\n* Item 2\r\n```js\r\nconsole.log(1);\r\n```\r\nFinal line';
    const element = tree(PureMarkdown({ src: crlf }));
    expect(element).toBeDefined();
    expect(element.props.children.length).toBeGreaterThan(0);
  });

  it('instantiates edit mode with textarea containing editedText', () => {
    const mockSkill: CatalogSkill = {
      id: 'custom-skill',
      name: 'custom-skill',
      description: 'Custom editable skill',
      category: 'Engineering',
      provenance: 'company',
      provenanceLabel: 'Acme',
      filePath: '/skills/custom/SKILL.md',
      isEditable: true,
      markdown: 'Original content',
    };

    const element = tree(SkillModal({
      skill: mockSkill,
      companyId: 'test-co',
      onClose: () => {},
      initialMode: 'edit',
    }));

    expect(element).toBeDefined();
    // Modal dialog -> Content container
    const dialog = element.props.children;
    const content = dialog.props.children[1];
    const editorDiv = content.props.children;
    const textarea = editorDiv.props.children[0];
    expect(textarea.type).toBe('textarea');
    expect(textarea.props.value).toBe('Original content');
  });

  it('instantiates preview mode rendering unsaved edits banner and PureMarkdown without data loss', () => {
    const mockSkill: CatalogSkill = {
      id: 'custom-skill',
      name: 'custom-skill',
      description: 'Custom editable skill',
      category: 'Engineering',
      provenance: 'company',
      provenanceLabel: 'Acme',
      filePath: '/skills/custom/SKILL.md',
      isEditable: true,
      markdown: '# Edited Header\nNew content here',
    };

    const element = tree(SkillModal({
      skill: mockSkill,
      companyId: 'test-co',
      onClose: () => {},
      initialMode: 'preview',
    }));

    expect(element).toBeDefined();
    const dialog = element.props.children;
    const content = dialog.props.children[1];
    const previewWrapper = content.props.children;
    const previewBanner = previewWrapper.props.children[0];
    expect(previewBanner.props.className).toContain('border-b');
    // PureMarkdown element rendering editedText
    const renderedMarkdown = previewWrapper.props.children[1];
    expect(renderedMarkdown.props.src).toBe('# Edited Header\nNew content here');
  });
});
