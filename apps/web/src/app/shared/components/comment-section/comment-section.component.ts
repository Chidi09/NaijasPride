import {
  Component,
  OnInit,
  inject,
  input,
  signal,
  computed,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { AuthService } from "../../../core/auth/auth.service";

interface CommentUser {
  id: string;
  username?: string;
  email: string;
}
interface Comment {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
  parentId: string | null;
  user: CommentUser;
  _count?: { replies: number };
  replies?: Comment[];
  showReplies?: boolean;
  repliesLoading?: boolean;
}

@Component({
  selector: "app-comment-section",
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [
    `
      .mention {
        color: #800020;
        font-weight: 600;
      }
      .comment-body {
        white-space: pre-wrap;
        word-break: break-word;
      }
    `,
  ],
  template: `
    <section class="mt-10 border-t border-[#d9c4b7] dark:border-white/10 pt-8">
      <h3
        class="text-xl font-serif font-bold text-[#24181b] dark:text-white mb-6"
      >
        Discussion
        @if (total() > 0) {
          <span
            class="text-sm font-normal text-[#9f7d73] dark:text-gray-400 ml-2"
            >({{ total() }})</span
          >
        }
      </h3>

      <!-- Post comment -->
      @if (auth.currentUser()) {
        <form (submit)="postComment($event)" class="mb-8">
          <textarea
            [(ngModel)]="newComment"
            name="newComment"
            placeholder="Share your thoughts… use @username to mention someone"
            rows="3"
            class="w-full rounded-lg border border-[#d9c4b7] dark:border-white/15 bg-white dark:bg-[#1a1a1a] text-[#24181b] dark:text-white placeholder-[#9f7d73] dark:placeholder-white/40 px-4 py-3 text-sm resize-none focus:outline-none focus:border-[#800020] dark:focus:border-[#800020] transition-colors"
          ></textarea>
          <div class="flex justify-end mt-2">
            <button
              type="submit"
              [disabled]="posting()"
              class="inline-flex items-center gap-2 bg-[#800020] hover:bg-[#600018] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
            >
              @if (posting()) {
                <span
                  class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                ></span>
              }
              Post Comment
            </button>
          </div>
        </form>
      } @else {
        <div
          class="mb-8 rounded-lg border border-[#d9c4b7] dark:border-white/10 px-4 py-4 text-sm text-[#725f58] dark:text-gray-400 text-center"
        >
          <a href="/login" class="text-[#800020] hover:underline font-semibold"
            >Sign in</a
          >
          to join the discussion.
        </div>
      }

      <!-- Comments list -->
      @if (loadingComments()) {
        <div class="space-y-4">
          @for (i of [1, 2, 3]; track i) {
            <div class="animate-pulse flex gap-3">
              <div
                class="w-9 h-9 rounded-full bg-[#e5d2c6] dark:bg-white/10 flex-shrink-0"
              ></div>
              <div class="flex-1 space-y-2">
                <div
                  class="h-3 w-24 bg-[#e5d2c6] dark:bg-white/10 rounded"
                ></div>
                <div
                  class="h-3 w-full bg-[#e5d2c6] dark:bg-white/10 rounded"
                ></div>
                <div
                  class="h-3 w-3/4 bg-[#e5d2c6] dark:bg-white/10 rounded"
                ></div>
              </div>
            </div>
          }
        </div>
      } @else if (comments().length === 0) {
        <p class="text-center text-[#9f7d73] dark:text-gray-500 text-sm py-8">
          No comments yet. Be the first!
        </p>
      } @else {
        <div class="space-y-6">
          @for (comment of comments(); track comment.id) {
            <div class="flex gap-3">
              <!-- Avatar -->
              <div
                class="flex-shrink-0 w-9 h-9 rounded-full bg-[#dfc8bb] dark:bg-[#2a2a2a] flex items-center justify-center text-xs font-bold text-[#6b3d2e] dark:text-white/70 uppercase"
              >
                {{ userInitial(comment.user) }}
              </div>

              <div class="flex-1 min-w-0">
                <!-- Author & time -->
                <div class="flex items-baseline gap-2 flex-wrap">
                  <span
                    class="text-sm font-semibold text-[#24181b] dark:text-white"
                    >{{ displayName(comment.user) }}</span
                  >
                  <span class="text-xs text-[#9f7d73] dark:text-gray-500">{{
                    timeAgo(comment.createdAt)
                  }}</span>
                </div>

                <!-- Body -->
                <p
                  class="comment-body text-sm text-[#3a2a25] dark:text-gray-300 mt-1 leading-relaxed"
                  [innerHTML]="renderBody(comment.body)"
                ></p>

                <!-- Actions -->
                <div class="flex items-center gap-4 mt-2">
                  <button
                    type="button"
                    (click)="toggleReplyForm(comment)"
                    class="text-xs text-[#9f7d73] dark:text-gray-500 hover:text-[#800020] dark:hover:text-[#800020] transition-colors"
                  >
                    Reply
                  </button>

                  @if ((comment._count?.replies ?? 0) > 0) {
                    <button
                      type="button"
                      (click)="toggleReplies(comment)"
                      class="text-xs text-[#9f7d73] dark:text-gray-500 hover:text-[#800020] dark:hover:text-[#800020] transition-colors"
                    >
                      {{ comment.showReplies ? "Hide" : "View" }}
                      {{ comment._count?.replies }}
                      {{
                        (comment._count?.replies ?? 0) === 1
                          ? "reply"
                          : "replies"
                      }}
                    </button>
                  }

                  @if (canDelete(comment)) {
                    <button
                      type="button"
                      (click)="deleteComment(comment)"
                      class="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  }
                </div>

                <!-- Reply form -->
                @if (replyingTo() === comment.id) {
                  <form (submit)="postReply($event, comment)" class="mt-3">
                    <textarea
                      [(ngModel)]="replyText"
                      [name]="'reply-' + comment.id"
                      [placeholder]="
                        'Reply to ' + displayName(comment.user) + '…'
                      "
                      rows="2"
                      class="w-full rounded-lg border border-[#d9c4b7] dark:border-white/15 bg-white dark:bg-[#1a1a1a] text-[#24181b] dark:text-white placeholder-[#9f7d73] dark:placeholder-white/40 px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#800020] dark:focus:border-[#800020] transition-colors"
                    ></textarea>
                    <div class="flex gap-2 justify-end mt-1.5">
                      <button
                        type="button"
                        (click)="replyingTo.set(null)"
                        class="text-xs text-[#9f7d73] hover:text-[#24181b] dark:hover:text-white px-3 py-1.5 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        [disabled]="postingReply()"
                        class="inline-flex items-center gap-1.5 bg-[#800020] hover:bg-[#600018] text-white text-xs font-semibold px-4 py-1.5 rounded-full transition-colors disabled:opacity-50"
                      >
                        @if (postingReply()) {
                          <span
                            class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"
                          ></span>
                        }
                        Reply
                      </button>
                    </div>
                  </form>
                }

                <!-- Replies -->
                @if (comment.showReplies) {
                  <div
                    class="mt-4 pl-4 border-l-2 border-[#d9c4b7] dark:border-white/10 space-y-4"
                  >
                    @if (comment.repliesLoading) {
                      <div
                        class="text-xs text-[#9f7d73] dark:text-gray-500 animate-pulse"
                      >
                        Loading replies…
                      </div>
                    } @else {
                      @for (reply of comment.replies || []; track reply.id) {
                        <div class="flex gap-2.5">
                          <div
                            class="flex-shrink-0 w-7 h-7 rounded-full bg-[#dfc8bb] dark:bg-[#2a2a2a] flex items-center justify-center text-[10px] font-bold text-[#6b3d2e] dark:text-white/70 uppercase"
                          >
                            {{ userInitial(reply.user) }}
                          </div>
                          <div class="flex-1">
                            <div class="flex items-baseline gap-2 flex-wrap">
                              <span
                                class="text-xs font-semibold text-[#24181b] dark:text-white"
                                >{{ displayName(reply.user) }}</span
                              >
                              <span
                                class="text-[10px] text-[#9f7d73] dark:text-gray-500"
                                >{{ timeAgo(reply.createdAt) }}</span
                              >
                            </div>
                            <p
                              class="comment-body text-xs text-[#3a2a25] dark:text-gray-300 mt-0.5 leading-relaxed"
                              [innerHTML]="renderBody(reply.body)"
                            ></p>
                            <div class="flex items-center gap-3 mt-1.5">
                              <button
                                type="button"
                                (click)="toggleReplyForm(comment)"
                                class="text-[10px] text-[#9f7d73] dark:text-gray-500 hover:text-[#800020] dark:hover:text-[#800020] transition-colors"
                              >
                                Reply
                              </button>
                              @if (canDelete(reply)) {
                                <button
                                  type="button"
                                  (click)="deleteComment(reply)"
                                  class="text-[10px] text-red-400 hover:text-red-600 transition-colors"
                                >
                                  Delete
                                </button>
                              }
                            </div>
                          </div>
                        </div>
                      }
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- Load more -->
        @if (hasMore()) {
          <div class="mt-8 text-center">
            <button
              type="button"
              (click)="loadMore()"
              [disabled]="loadingMore()"
              class="inline-flex items-center gap-2 border border-[#d9c4b7] dark:border-white/15 text-[#725f58] dark:text-gray-400 hover:border-[#800020] hover:text-[#800020] dark:hover:border-[#800020] dark:hover:text-[#800020] text-sm px-5 py-2 rounded-full transition-colors disabled:opacity-50"
            >
              @if (loadingMore()) {
                <span
                  class="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin"
                ></span>
              }
              Load more comments
            </button>
          </div>
        }
      }
    </section>
  `,
})
export class CommentSectionComponent implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);

  movieId = input<string | undefined>(undefined);
  showId = input<string | undefined>(undefined);

  comments = signal<Comment[]>([]);
  total = signal(0);
  loadingComments = signal(false);
  loadingMore = signal(false);
  posting = signal(false);
  postingReply = signal(false);
  replyingTo = signal<string | null>(null);
  newComment = "";
  replyText = "";
  private page = 1;
  private readonly limit = 15;

  hasMore = computed(() => this.comments().length < this.total());

  ngOnInit() {
    this.loadComments(1, false);
  }

  private get queryParams(): string {
    const id = this.movieId();
    const sid = this.showId();
    if (id) return `movieId=${id}`;
    if (sid) return `showId=${sid}`;
    return "";
  }

  private loadComments(page: number, append: boolean) {
    if (!this.queryParams) return;
    if (append) this.loadingMore.set(true);
    else this.loadingComments.set(true);

    this.http
      .get<{
        data: Comment[];
        meta: { total: number };
      }>(
        `/api/v1/comments?${this.queryParams}&page=${page}&limit=${this.limit}`,
      )
      .subscribe({
        next: (res) => {
          this.total.set(res.meta.total);
          if (append) {
            this.comments.update((c) => [...c, ...res.data]);
            this.loadingMore.set(false);
          } else {
            this.comments.set(res.data);
            this.loadingComments.set(false);
          }
          this.page = page;
        },
        error: () => {
          this.loadingComments.set(false);
          this.loadingMore.set(false);
        },
      });
  }

  loadMore() {
    this.loadComments(this.page + 1, true);
  }

  postComment(event: Event) {
    event.preventDefault();
    const body = this.newComment.trim();
    if (!body || this.posting()) return;

    this.posting.set(true);
    const payload: Record<string, string> = { body };
    const mid = this.movieId();
    const sid = this.showId();
    if (mid) payload["movieId"] = mid;
    if (sid) payload["showId"] = sid;

    this.http.post<{ data: Comment }>("/api/v1/comments", payload).subscribe({
      next: (res) => {
        this.comments.update((c) => [res.data, ...c]);
        this.total.update((t) => t + 1);
        this.newComment = "";
        this.posting.set(false);
      },
      error: () => this.posting.set(false),
    });
  }

  toggleReplyForm(comment: Comment) {
    this.replyText = "";
    this.replyingTo.update((v) => (v === comment.id ? null : comment.id));
  }

  postReply(event: Event, parent: Comment) {
    event.preventDefault();
    const body = this.replyText.trim();
    if (!body || this.postingReply()) return;

    this.postingReply.set(true);
    const payload: Record<string, string> = { body, parentId: parent.id };
    const mid = this.movieId();
    const sid = this.showId();
    if (mid) payload["movieId"] = mid;
    if (sid) payload["showId"] = sid;

    this.http.post<{ data: Comment }>("/api/v1/comments", payload).subscribe({
      next: (res) => {
        // Add reply to the parent's replies list
        this.comments.update((list) =>
          list.map((c) => {
            if (c.id !== parent.id) return c;
            const replies = [...(c.replies || []), res.data];
            const count = (c._count?.replies ?? 0) + 1;
            return {
              ...c,
              replies,
              showReplies: true,
              _count: { replies: count },
            };
          }),
        );
        this.replyText = "";
        this.replyingTo.set(null);
        this.postingReply.set(false);
      },
      error: () => this.postingReply.set(false),
    });
  }

  toggleReplies(comment: Comment) {
    const current = comments_find(this.comments(), comment.id);
    if (!current) return;

    if (current.showReplies) {
      this.comments.update((list) =>
        list.map((c) =>
          c.id === comment.id ? { ...c, showReplies: false } : c,
        ),
      );
      return;
    }

    if (current.replies?.length) {
      this.comments.update((list) =>
        list.map((c) =>
          c.id === comment.id ? { ...c, showReplies: true } : c,
        ),
      );
      return;
    }

    this.comments.update((list) =>
      list.map((c) =>
        c.id === comment.id
          ? { ...c, repliesLoading: true, showReplies: true }
          : c,
      ),
    );
    this.http
      .get<{ data: Comment[] }>(`/api/v1/comments/${comment.id}/replies`)
      .subscribe({
        next: (res) => {
          this.comments.update((list) =>
            list.map((c) =>
              c.id === comment.id
                ? { ...c, replies: res.data, repliesLoading: false }
                : c,
            ),
          );
        },
        error: () => {
          this.comments.update((list) =>
            list.map((c) =>
              c.id === comment.id
                ? { ...c, repliesLoading: false, showReplies: false }
                : c,
            ),
          );
        },
      });
  }

  deleteComment(comment: Comment) {
    this.http.delete(`/api/v1/comments/${comment.id}`).subscribe({
      next: () => {
        if (!comment.parentId) {
          this.comments.update((list) =>
            list.filter((c) => c.id !== comment.id),
          );
          this.total.update((t) => Math.max(0, t - 1));
        } else {
          this.comments.update((list) =>
            list.map((c) => ({
              ...c,
              replies: (c.replies || []).filter((r) => r.id !== comment.id),
              _count: c.replies?.some((r) => r.id === comment.id)
                ? { replies: Math.max(0, (c._count?.replies ?? 1) - 1) }
                : c._count,
            })),
          );
        }
      },
      error: () => {},
    });
  }

  canDelete(comment: Comment): boolean {
    const user = this.auth.currentUser();
    if (!user) return false;
    return user.id === comment.userId || user.role === "ADMIN";
  }

  userInitial(user: CommentUser): string {
    if (!user) return "?";
    const name = user.username || user.email || "?";
    return name[0]?.toUpperCase() ?? "?";
  }

  displayName(user: CommentUser): string {
    if (!user) return "Unknown";
    return user.username || user.email?.split("@")[0] || "User";
  }

  renderBody(body: string): string {
    // Escape HTML then highlight @mentions
    const escaped = body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }
}

function comments_find(list: Comment[], id: string): Comment | undefined {
  return list.find((c) => c.id === id);
}
