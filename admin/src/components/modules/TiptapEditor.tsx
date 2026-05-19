'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Heading2, Undo2, Redo2 } from 'lucide-react';
import { useEffect } from 'react';

interface Props {
  value:    string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?:   number;
}

// Lightweight Tiptap wrapper used by SendEmailModal (and reusable
// anywhere we need a small rich-text editor). Outputs sanitised
// HTML — the toolbar exposes B / I / heading / lists / link /
// undo+redo which is plenty for email composition.
export default function TiptapEditor({ value, onChange, placeholder, minHeight = 200 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({
        openOnClick: false,
        autolink:    true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none px-3 py-2',
        style: `min-height: ${minHeight}px;`,
        'data-placeholder': placeholder ?? '',
      },
    },
    immediatelyRender: false,
  });

  // Keep the editor in sync if the parent resets `value` externally
  // (e.g. after a successful send → clears the modal state).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className="rounded-md text-xs flex items-center justify-center"
        style={{ minHeight, border: '1px solid var(--line)', color: 'var(--ink-faint)' }}
      >
        Loading editor…
      </div>
    );
  }

  function promptLink() {
    const prev = editor!.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', prev ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor!.chain().focus().unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  const btn = (active: boolean) => ({
    background: active ? 'var(--surface-alt)' : 'transparent',
    color:      active ? 'var(--purple)'      : 'var(--ink-soft)',
    border:     'none',
    borderRadius: 6,
    padding:    '4px 6px',
    cursor:     'pointer',
  });

  return (
    <div className="rounded-md" style={{ border: '1px solid var(--line)' }}>
      <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
        <button type="button" title="Bold (⌘B)"        onClick={() => editor.chain().focus().toggleBold().run()}   style={btn(editor.isActive('bold'))}>      <Bold size={13} />     </button>
        <button type="button" title="Italic (⌘I)"      onClick={() => editor.chain().focus().toggleItalic().run()} style={btn(editor.isActive('italic'))}>    <Italic size={13} />   </button>
        <button type="button" title="Heading"          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} style={btn(editor.isActive('heading', { level: 2 }))}><Heading2 size={13} /></button>
        <span style={{ width: 1, height: 16, background: 'var(--line)', margin: '0 4px' }} />
        <button type="button" title="Bullet list"      onClick={() => editor.chain().focus().toggleBulletList().run()}  style={btn(editor.isActive('bulletList'))}> <List size={13} />     </button>
        <button type="button" title="Numbered list"    onClick={() => editor.chain().focus().toggleOrderedList().run()} style={btn(editor.isActive('orderedList'))}><ListOrdered size={13} /></button>
        <span style={{ width: 1, height: 16, background: 'var(--line)', margin: '0 4px' }} />
        <button type="button" title="Link"             onClick={promptLink}                                style={btn(editor.isActive('link'))}>      <LinkIcon size={13} /> </button>
        <span style={{ width: 1, height: 16, background: 'var(--line)', margin: '0 4px' }} />
        <button type="button" title="Undo (⌘Z)"        onClick={() => editor.chain().focus().undo().run()} style={btn(false)} disabled={!editor.can().undo()}><Undo2 size={13} /></button>
        <button type="button" title="Redo (⌘⇧Z)"       onClick={() => editor.chain().focus().redo().run()} style={btn(false)} disabled={!editor.can().redo()}><Redo2 size={13} /></button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
