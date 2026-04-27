import { redirect } from 'next/navigation';

// /clients/new is retired. The single canonical path for adding a
// client is the wizard at /clients/onboard. This redirect keeps any
// bookmarks or older deep-links from breaking.
export default function NewClientRedirect() {
  redirect('/clients/onboard');
}
