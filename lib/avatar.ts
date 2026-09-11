export type AvatarUser = {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string | null;
  profilePicture?: string | null;
};

export function getAvatarUrl(user: AvatarUser | null | undefined): string | null {
  if (!user) return null;
  return user.profilePicture || user.avatar || user.image || null;
}

export function getInitials(user: AvatarUser | null | undefined): string {
  const src = (user?.name || user?.username || user?.email || "U").trim();
  if (!src) return "U";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const w = parts[0];
    // if email, take first letter
    return w.slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getDisplayName(user: AvatarUser | null | undefined): string {
  return user?.name || user?.username || user?.email || "User";
}
