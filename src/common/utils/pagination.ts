export const getPagination = (page = 1, limit = 20) => {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(50, Math.max(1, limit));

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
};

export const paginatedResponse = <T>(items: T[], total: number, page: number, limit: number) => ({
  items,
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
