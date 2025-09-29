export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    totalPages: number;
    currentPage: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function calculatePagination(total: number, limit: number, offset: number) {
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  const hasNext = offset + limit < total;
  const hasPrev = offset > 0;

  return {
    total,
    limit,
    offset,
    totalPages,
    currentPage,
    hasNext,
    hasPrev
  };
}

export function validatePaginationParams(limit?: number, offset?: number): PaginationParams {
  const validatedLimit = Math.min(Math.max(limit || 50, 1), 100);
  const validatedOffset = Math.max(offset || 0, 0);
  
  return {
    limit: validatedLimit,
    offset: validatedOffset
  };
}
