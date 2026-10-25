const buildPaginationResponse = (page, limit, totalRecords) => {
  return {
    page: parseInt(page),
    limit: parseInt(limit),
    totalRecords,
    totalPages: Math.ceil(totalRecords / limit),
  };
};

const buildSearchQuery = (searchTerm, fields) => {
  if (!searchTerm || !fields.length) return {};
  const regex = new RegExp(searchTerm, 'i');
  return { $or: fields.map((field) => ({ [field]: regex })) };
};

const normalizeDate = (dateInput) => {
  if (!dateInput) return new Date();
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }
  const date = new Date(dateInput);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0));
};

module.exports = {
  buildPaginationResponse,
  buildSearchQuery,
  normalizeDate,
};
