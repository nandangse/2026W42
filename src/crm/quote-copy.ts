/** The fields a quote revision or duplicate carries (30 Aug 2026). */
export const QUOTE_COPY_FIELDS = [
  "opportunity_id", "company_id", "contact_id", "owner_id", "currency", "fx_rate",
  "incoterm", "incoterm_place", "payment_terms", "delivery_weeks", "warranty_months",
  "validity_days", "discount_pct", "freight", "insurance", "packing", "installation",
  "scope_of_supply", "exclusions", "notes", "address_id", "mail_to", "mail_cc", "mail_bcc",
  "tax_id", "authorized_by", "show_decimals", "situational_details", "subject",
  "terms_template", "terms_text", "letter_template", "letter_text",
  "cover_template", "cover_text", "back_template", "back_text", "about_template", "about_text",
  "print_sections",
];
export const QUOTE_LINE_COPY_FIELDS = [
  "line_no", "product_id", "description", "specs", "quantity", "uom", "unit_price",
  "unit_cost", "discount_pct", "gst_rate", "is_optional", "hsn_code", "indent", "item_group", "discountable",
];
