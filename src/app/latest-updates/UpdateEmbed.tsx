interface Props {
  embedHtml: string;
}

export default function UpdateEmbed({ embedHtml }: Props) {
  return (
    <div
      className="card p-4 overflow-hidden"
      style={{ minHeight: 600 }}
      dangerouslySetInnerHTML={{ __html: embedHtml }}
    />
  );
}
