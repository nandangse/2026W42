/**
 * The WhatsApp button, bottom right (Dr Raghu, 5 Sep 2026): "in the IDP I
 * want a whatsapp icon in the bottom right. It has to be sent to 9136010550
 * with a message: Hi / / / {{name}} / {{form_name}}".
 *
 * A plain wa.me link — no API, no queue: the employee's own WhatsApp opens
 * with the message ready, and they press send. The number is the company's.
 */
export const WHATSAPP_HELP_NUMBER = "919136010550";

export default function WhatsAppFab({ name, form }: { name: string; form: string }) {
  const text = `Hi\n\n\n${name}\n${form}`;
  const href = `https://wa.me/${WHATSAPP_HELP_NUMBER}?text=${encodeURIComponent(text)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`WhatsApp HR about ${form}`}
      aria-label="WhatsApp HR"
      style={{
        position: "fixed", right: 18, bottom: 18, zIndex: 60,
        width: 56, height: 56, borderRadius: 28, background: "#25D366",
        boxShadow: "0 4px 14px rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
        <path fill="#fff" d="M16 3C8.8 3 3 8.7 3 15.8c0 2.5.7 4.9 2 7L3 29l6.4-1.9c2 1.1 4.3 1.7 6.6 1.7 7.2 0 13-5.7 13-12.9S23.2 3 16 3zm0 23.5c-2 0-4-.6-5.7-1.6l-.4-.2-3.8 1.1 1.1-3.6-.3-.4a10.4 10.4 0 0 1-1.7-5.9C5.2 10 10 5.2 16 5.2s10.8 4.8 10.8 10.7S22 26.5 16 26.5zm5.9-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6.3-.5c.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.2 1.3 3.4c.2.2 2.3 3.5 5.6 4.9.8.3 1.4.5 1.9.7.8.2 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z" />
      </svg>
    </a>
  );
}
