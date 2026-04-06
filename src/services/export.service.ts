export function generateCSV(businesses: any[]): string {
  const headers = [
    'Business Name',
    'Rating',
    'Reviews',
    'Category',
    'Address',
    'Phone',
    'Website',
    'Google Maps URL',
    'Place ID',
  ];

  const escape = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = businesses.map((b) =>
    [
      escape(b.name),
      escape(b.rating),
      escape(b.reviewCount),
      escape(b.category),
      escape(b.address),
      escape(b.phone),
      escape(b.website),
      escape(b.mapsUrl),
      escape(b.placeId),
    ].join(',')
  );

  return [headers.map((h) => `"${h}"`).join(','), ...rows].join('\n');
}
