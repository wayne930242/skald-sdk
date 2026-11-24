/**
 * JSON value type. Structurally identical to the `Json` the Supabase generator emits in
 * `database.ts`; it lives here so the public subset never imports the generated database types.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
