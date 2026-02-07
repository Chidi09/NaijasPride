import { PrismaClient } from '@prisma/client';

export class ProfileService {
  constructor(private prisma: PrismaClient) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        watchlist: true, // simplified, in production paginate this
        downloadHistory: {
          include: { movie: true },
          orderBy: { timestamp: 'desc' },
          take: 10
        }
      }
    });

    if (!user) throw new Error('User not found');

    // Basic Recommendation Logic: Get genre of last download
    let recommendations: any[] = [];
    if (user.downloadHistory.length > 0) {
      const lastGenre = user.downloadHistory[0].movie.genre[0];
      recommendations = await this.prisma.movie.findMany({
        where: { 
          genre: { has: lastGenre },
          id: { notIn: user.downloadHistory.map(d => d.movieId) } 
        },
        take: 5
      });
    }

    return { ...user, recommendations };
  }

  async toggleWatchlist(userId: string, movieId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { watchlist: { where: { id: movieId } } }
    });

    if (user?.watchlist.length) {
      // Remove
      await this.prisma.user.update({
        where: { id: userId },
        data: { watchlist: { disconnect: { id: movieId } } }
      });
      return { added: false };
    } else {
      // Add
      await this.prisma.user.update({
        where: { id: userId },
        data: { watchlist: { connect: { id: movieId } } }
      });
      return { added: true };
    }
  }
}
