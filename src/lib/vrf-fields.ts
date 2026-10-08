/** THE VENDOR REGISTRATION FORM, AS MUKESH MADE IT on nandan.co.in (read off the page 8 Oct 2026) — shared by the public form and the purchase team's view. */
export const VRF_RELATIONSHIP = ["Existing Supplier", "New supplier invited to fill this form", "New supplier need to enter Nandan"];
export const VRF_COMPANY_TYPES = ["Sole Proprietorship", "LLP", "Partnership", "Private Limited", "Limited (Unlisted)", "Limited (Listed)", "Others"];
export const VRF_ITEMS = [
  "Steel", "Aluminum", "Hardware", "Consumables", "Hydraulic cylinders", "Hydraulic valves", "Electrical components", "Hydraulic components",
  "Fabricated items - steel", "Fabricated items - stainless steel", "Fabricated items - others", "Composites and Plastics", "Jobwork",
  "Machining Services", "Automotive Components", "Consultancy services", "Design services", "Other",
];
export const VRF_FILE_KINDS: [string, string][] = [["pan", "Pan Card Copy Upload"], ["gst", "GST Registration Copy Upload"], ["brochure", "Attach Your Brochures Or Presentation"], ["cheque", "Upload Cancelled Cheque"]];
export interface VrfRow {
  id: string; at: string; email: string; supplier_id: string; relationship: string;
  storage_facility: string; inspection_facility: string; inhouse_mfg: string; outsourced_processes: string;
  company_name: string; contact_name: string; contact_mobile: string; company_email: string; company_phone: string;
  address: string; city: string; pin: string; established_year: string; pan_no: string; company_type: string; gst_no: string;
  items_supplied: string[]; other_items: string; brief: string;
  bank_name: string; account_no: string; ifsc: string; branch: string; accounts_contact: string; send_copy: boolean;
  files: { kind: string; name: string; path: string; size: number }[];
  status: string; review_note: string; reviewed_by: string | null; reviewed_at: string | null;
}
