export interface Book {
  id: string;
  title: string;
  slug: string;
  author: string;
  description: string | null;
  year: number;
  isbn: string | null;
  coverUrl: string | null;
  downloadUrl: string | null;
  fileSize: number | null;
  format: string;
  genre: string[];
  language: string;
  pageCount: number | null;
  rating: number | null;
  publisher: string | null;
  downloadCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookSummary {
  id: string;
  title: string;
  slug: string;
  author: string;
  year: number;
  coverUrl: string | null;
  genre: string[];
  rating: number | null;
  pageCount: number | null;
}
