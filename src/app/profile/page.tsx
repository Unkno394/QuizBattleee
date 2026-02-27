"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, User } from "lucide-react";

import AnimatedBackground from "../../components/AnimatedBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { useAlert } from "../components/CustomAlert";
import {
  ApiError,
  buyShopItem,
  changeEmail,
  changePassword,
  forgotPassword,
  getProfile,
  getShop,
  logout,
  ProfileUser,
  resetPassword,
  ShopCatalogItem,
  ShopState,
  equipShopItem,
  updateProfile,
} from "@/shared/api/auth";
import { ShopModal } from "@/shared/shop/ShopModal";
import { Frame } from "@/shared/shop/Frame";
import {
  MAX_AVATAR_BASE64_LENGTH,
  PasswordMode,
  REGISTERED_STORAGE_KEY,
} from "@/features/profile/constants";
import {
  SettingItem,
  SettingsSection,
  WaveColorSelector,
  getWaveColorClass,
} from "@/features/profile/components/SettingsPrimitives";
import {
  compressAvatarToDataUrl,
  formatCreatedAt,
  formatLastLogin,
  validatePasswordPolicy,
} from "@/features/profile/utils";

export default function ProfilePage() {
  const router = useRouter();
  const [returnTo, setReturnTo] = useState("/");

  const { waveColor, setWaveColor } = useTheme();
  const { AlertComponent, notify } = useAlert();
  const notifyRef = useRef(notify);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");

  const [passwordMode, setPasswordMode] = useState<PasswordMode>("current");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isAvatarBroken, setIsAvatarBroken] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [shopCatalog, setShopCatalog] = useState<ShopCatalogItem[]>([]);
  const [shopState, setShopState] = useState<ShopState | null>(null);
  const [shopBusyId, setShopBusyId] = useState<string | null>(null);

  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmNewPassword, setResetConfirmNewPassword] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  useEffect(() => {
    setIsAvatarBroken(false);
  }, [profile?.avatar_url]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search);
    const returnToParam = query.get("returnTo");
    if (returnToParam && returnToParam.startsWith("/")) {
      setReturnTo(returnToParam);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const rawToken = window.localStorage.getItem("access_token");
    const token = rawToken?.trim() || "";
    if (!token || token === "undefined" || token === "null") {
      router.push(`/auth?returnTo=${encodeURIComponent("/profile")}`);
      return;
    }

    let isCancelled = false;

    const loadProfile = async () => {
      setIsLoading(true);
      try {
        const response = await getProfile();
        if (isCancelled) return;
        setProfile(response.user);
        setNameDraft(response.user.display_name || "");
        setEmailDraft(response.user.email || "");
        try {
          const shopResponse = await getShop(token);
          if (!isCancelled) {
            setShopCatalog(shopResponse.catalog || []);
            setShopState(shopResponse.state || null);
          }
        } catch {
          if (!isCancelled) {
            setShopCatalog([]);
            setShopState(null);
          }
        }
      } catch (error: unknown) {
        if (isCancelled) return;
        const message = error instanceof Error ? error.message : "Не удалось загрузить профиль";
        notifyRef.current(message, "error");
        const status =
          typeof error === "object" && error !== null && "status" in error
            ? Number((error as ApiError).status)
            : undefined;
        const isAuthError = status === 401 || status === 403 || /401|403|токен|unauthor/i.test(message);
        if (typeof window !== "undefined" && isAuthError) {
          window.localStorage.removeItem("access_token");
          router.push(`/auth?returnTo=${encodeURIComponent("/profile")}`);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      isCancelled = true;
    };
  }, [router]);

  const handleBack = () => {
    router.push(returnTo);
  };

  const handleLogout = () => {
    setIsLogoutModalOpen(true);
  };

  const handleLogoutConfirm = async () => {
    try {
      await logout();
    } catch {
      // Ignore logout API errors on client cleanup path.
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("access_token");
      window.localStorage.removeItem(REGISTERED_STORAGE_KEY);
    }
    router.push("/");
  };

  const handleSaveName = async () => {
    const value = nameDraft.trim();
    if (!value) {
      notify("Имя не может быть пустым", "error");
      return;
    }

    try {
      const response = await updateProfile({ display_name: value });
      setProfile(response.user);
      setNameDraft(response.user.display_name);
      setIsEditingName(false);
      notify("Имя обновлено", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Не удалось обновить имя";
      notify(message, "error");
    }
  };

  const handleSaveEmail = async () => {
    const nextEmail = emailDraft.trim().toLowerCase();
    if (!nextEmail) {
      notify("Введите email", "error");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(nextEmail)) {
      notify("Введите корректный email", "error");
      return;
    }

    if (!emailCurrentPassword) {
      notify("Введите текущий пароль для подтверждения", "error");
      return;
    }

    try {
      const response = await changeEmail({
        new_email: nextEmail,
        current_password: emailCurrentPassword,
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem("access_token", response.access_token);
      }
      setProfile(response.user);
      setEmailDraft(response.user.email);
      setEmailCurrentPassword("");
      setIsEditingEmail(false);
      notify("Email изменен", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Не удалось изменить email";
      notify(message, "error");
    }
  };

  const handleChangePasswordByCurrent = async () => {
    if (!currentPassword) {
      notify("Введите текущий пароль", "error");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      notify("Новые пароли не совпадают", "error");
      return;
    }

    const validationError = validatePasswordPolicy(newPassword);
    if (validationError) {
      notify(validationError, "error");
      return;
    }

    try {
      await changePassword({
        old_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: confirmNewPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      notify("Пароль изменен", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Не удалось изменить пароль";
      notify(message, "error");
    }
  };

  const handleSendResetCode = async () => {
    if (!profile?.email) return;
    try {
      await forgotPassword(profile.email);
      setResetCodeSent(true);
      notify("Проверьте почту и введите код для сброса пароля", "info");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Не удалось отправить код";
      notify(message, "error");
    }
  };

  const handleResetPasswordByCode = async () => {
    if (!profile?.email) return;
    if (!resetCode.trim()) {
      notify("Введите код из письма", "error");
      return;
    }
    if (resetNewPassword !== resetConfirmNewPassword) {
      notify("Новые пароли не совпадают", "error");
      return;
    }

    const validationError = validatePasswordPolicy(resetNewPassword);
    if (validationError) {
      notify(validationError, "error");
      return;
    }

    try {
      await resetPassword({
        email: profile.email,
        token: resetCode.trim(),
        new_password: resetNewPassword,
        new_password_confirm: resetConfirmNewPassword,
      });
      setResetCode("");
      setResetNewPassword("");
      setResetConfirmNewPassword("");
      setResetCodeSent(false);
      notify("Пароль изменен через код", "success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Не удалось сбросить пароль";
      notify(message, "error");
    }
  };

  const handleAvatarClick = () => avatarInputRef.current?.click();

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      notify("Максимальный размер аватара: 5MB", "error");
      return;
    }

    void (async () => {
      try {
        const result = await compressAvatarToDataUrl(file);
        if (result.length > MAX_AVATAR_BASE64_LENGTH) {
          notify("Аватар слишком большой. Выберите изображение меньшего размера.", "error");
          return;
        }

        const response = await updateProfile({ avatar_url: result });
        setProfile(response.user);
        notify("Аватар обновлен", "success");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Не удалось обновить аватар";
        notify(message, "error");
      }
    })();
  };

  const buyItem = async (itemId: string) => {
    if (typeof window === "undefined") return;
    const token = (window.localStorage.getItem("access_token") || "").trim();
    if (!token || token === "undefined" || token === "null") return;
    setShopBusyId(itemId);
    try {
      const response = await buyShopItem(itemId, token);
      setShopState(response.state);
      const refreshed = await getProfile(token);
      setProfile(refreshed.user);
    } finally {
      setShopBusyId(null);
    }
  };

  const equipItem = async (
    target: "profile_frame" | "cat" | "dog" | "victory_front" | "victory_back",
    itemId: string | null | undefined
  ) => {
    if (typeof window === "undefined") return;
    const token = (window.localStorage.getItem("access_token") || "").trim();
    if (!token || token === "undefined" || token === "null") return;
    setShopBusyId(`${target}:${itemId || "none"}`);
    try {
      const response = await equipShopItem({ target, item_id: itemId || null }, token);
      setShopState(response.state);
      const refreshed = await getProfile(token);
      setProfile(refreshed.user);
    } finally {
      setShopBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="relative min-h-screen">
        <AnimatedBackground className="fixed inset-0 -z-10 h-full w-full" />
        <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl items-center justify-center px-4 text-white/80">
          Загрузка профиля...
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="relative min-h-screen">
      <AnimatedBackground className="fixed inset-0 -z-10 h-full w-full" />

      <div className="relative z-10">
        <header className="flex items-center justify-between p-4 md:p-6">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 text-white transition-colors hover:text-white/80"
            title="Назад"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
            </svg>
            <span>Назад</span>
          </button>
          <span className="hidden text-white/70 sm:inline">Профиль</span>
        </header>

        <main className="container mx-auto max-w-4xl px-4 pb-8 md:px-6">
          <div className="mb-8 flex items-center gap-4">
            <div className="cursor-pointer transition-transform hover:scale-105" onClick={handleAvatarClick}>
              <Frame
                frameId={shopState?.equipped?.profileFrame || profile.profile_frame}
                className="h-20 w-20"
                radiusClass="rounded-full"
                innerClassName={`relative flex h-full w-full items-center justify-center rounded-full ${getWaveColorClass(
                  waveColor
                )} p-0 text-2xl font-semibold text-white`}
              >
                {profile.avatar_url && !isAvatarBroken ? (
                  <img
                    src={profile.avatar_url}
                    alt="Аватар"
                    className="h-full w-full rounded-full object-cover"
                    onError={() => setIsAvatarBroken(true)}
                  />
                ) : (
                  <User className="h-10 w-10 text-white/90" />
                )}
              </Frame>
            </div>

            <div className="flex-1">
              {isEditingName ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="flex-1 rounded border border-white/30 bg-white/20 px-3 py-2 text-white placeholder-white/50 outline-none focus:border-white/50"
                    placeholder="Введите имя"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveName}
                      className="rounded bg-blue-500 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-600"
                    >
                      Сохранить
                    </button>
                    <button
                      onClick={() => {
                        setNameDraft(profile.display_name);
                        setIsEditingName(false);
                      }}
                      className="rounded bg-white/20 px-3 py-2 text-sm text-white transition-colors hover:bg-white/30"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white">{profile.display_name}</h1>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="text-sm text-blue-400 transition-colors hover:text-blue-300"
                  >
                    Изменить
                  </button>
                </div>
              )}
              <p className="text-white/70">{profile.email}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsShopOpen(true)}
                  className="rounded-lg border border-emerald-300/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                >
                  Магазин
                </button>
                <div className="inline-flex items-center gap-1 rounded-lg border border-amber-300/40 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100">
                  <span>⭐</span>
                  <span>{shopState?.balance ?? profile.coins ?? 0}</span>
                </div>
              </div>
              <button
                onClick={handleAvatarClick}
                className="mt-2 text-sm text-blue-400 transition-colors hover:text-blue-300"
              >
                Сменить аватар
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
          </div>

          <SettingsSection title="Личная информация">
            <SettingItem label="Электронная почта">
              {isEditingEmail ? (
                <div className="flex max-w-md flex-col gap-2">
                  <input
                    type="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    className="rounded border border-white/30 bg-white/20 px-3 py-2 text-white placeholder-white/50 outline-none focus:border-white/50"
                    placeholder="Новый email"
                  />
                  <input
                    type="password"
                    value={emailCurrentPassword}
                    onChange={(e) => setEmailCurrentPassword(e.target.value)}
                    className="rounded border border-white/30 bg-white/20 px-3 py-2 text-white placeholder-white/50 outline-none focus:border-white/50"
                    placeholder="Текущий пароль для подтверждения"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEmail}
                      className="rounded bg-blue-500 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-600"
                    >
                      Сохранить
                    </button>
                    <button
                      onClick={() => {
                        setEmailDraft(profile.email);
                        setEmailCurrentPassword("");
                        setIsEditingEmail(false);
                      }}
                      className="rounded bg-white/20 px-3 py-2 text-sm text-white transition-colors hover:bg-white/30"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-white/70">{profile.email}</span>
                  <button
                    onClick={() => setIsEditingEmail(true)}
                    className="text-sm text-blue-400 transition-colors hover:text-blue-300"
                  >
                    Изменить
                  </button>
                </div>
              )}
            </SettingItem>
          </SettingsSection>

          <SettingsSection title="Безопасность">
            <SettingItem label="Смена пароля">
              <div className="w-full max-w-md">
                <div className="mb-3 flex gap-2">
                  <button
                    onClick={() => setPasswordMode("current")}
                    className={`rounded px-3 py-2 text-sm transition-colors ${
                      passwordMode === "current"
                        ? "bg-blue-500 text-white"
                        : "bg-white/15 text-white/80 hover:bg-white/25"
                    }`}
                  >
                    Через старый пароль
                  </button>
                  <button
                    onClick={() => setPasswordMode("email_reset")}
                    className={`rounded px-3 py-2 text-sm transition-colors ${
                      passwordMode === "email_reset"
                        ? "bg-blue-500 text-white"
                        : "bg-white/15 text-white/80 hover:bg-white/25"
                    }`}
                  >
                    Через код на email
                  </button>
                </div>

                {passwordMode === "current" ? (
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full rounded border border-white/30 bg-white/20 px-3 py-2 pr-10 text-white placeholder-white/50 outline-none focus:border-white/50"
                        placeholder="Текущий пароль"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword((value) => !value)}
                        className="absolute inset-y-0 right-3 flex items-center text-white/70 hover:text-white"
                        aria-label={showCurrentPassword ? "Скрыть пароль" : "Показать пароль"}
                      >
                        {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded border border-white/30 bg-white/20 px-3 py-2 pr-10 text-white placeholder-white/50 outline-none focus:border-white/50"
                        placeholder="Новый пароль"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((value) => !value)}
                        className="absolute inset-y-0 right-3 flex items-center text-white/70 hover:text-white"
                        aria-label={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showConfirmNewPassword ? "text" : "password"}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full rounded border border-white/30 bg-white/20 px-3 py-2 pr-10 text-white placeholder-white/50 outline-none focus:border-white/50"
                        placeholder="Подтвердите новый пароль"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPassword((value) => !value)}
                        className="absolute inset-y-0 right-3 flex items-center text-white/70 hover:text-white"
                        aria-label={showConfirmNewPassword ? "Скрыть пароль" : "Показать пароль"}
                      >
                        {showConfirmNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <button
                      onClick={handleChangePasswordByCurrent}
                      className="rounded bg-blue-500 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-600"
                    >
                      Сохранить пароль
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleSendResetCode}
                      className="rounded bg-white/20 px-3 py-2 text-sm text-white transition-colors hover:bg-white/30"
                    >
                      {resetCodeSent ? "Отправить код повторно" : "Отправить код"}
                    </button>
                    <input
                      type="text"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      className="rounded border border-white/30 bg-white/20 px-3 py-2 text-white placeholder-white/50 outline-none focus:border-white/50"
                      placeholder="Код из письма"
                    />
                    <input
                      type="password"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      className="rounded border border-white/30 bg-white/20 px-3 py-2 text-white placeholder-white/50 outline-none focus:border-white/50"
                      placeholder="Новый пароль"
                    />
                    <input
                      type="password"
                      value={resetConfirmNewPassword}
                      onChange={(e) => setResetConfirmNewPassword(e.target.value)}
                      className="rounded border border-white/30 bg-white/20 px-3 py-2 text-white placeholder-white/50 outline-none focus:border-white/50"
                      placeholder="Подтвердите новый пароль"
                    />
                    <button
                      onClick={handleResetPasswordByCode}
                      className="rounded bg-blue-500 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-600"
                    >
                      Сбросить пароль по коду
                    </button>
                  </div>
                )}
              </div>
            </SettingItem>
          </SettingsSection>

          <SettingsSection title="Внешний вид">
            <SettingItem label="Цвет волны">
              <div className="flex flex-col items-start gap-3">
                <span className="text-sm text-white/70">Выберите цвет анимированной волны</span>
                <WaveColorSelector currentColor={waveColor} onColorChange={setWaveColor} />
              </div>
            </SettingItem>
          </SettingsSection>

          <SettingsSection title="Действия">
            <SettingItem label="Выйти из системы">
              <button
                onClick={handleLogout}
                className="whitespace-nowrap rounded-lg border border-red-500/30 bg-red-500/20 px-6 py-3 text-red-300 transition-colors duration-300 hover:bg-red-500/30 hover:text-red-200"
              >
                Выйти из системы
              </button>
            </SettingItem>
          </SettingsSection>

          <div className="mt-8 text-center text-sm text-white/50">
            <p>Аккаунт создан: {formatCreatedAt(profile.created_at)}</p>
            <p className="mt-1">Последний вход: {formatLastLogin(profile.last_login_at)}</p>
          </div>

          <AlertComponent />
        </main>
      </div>

      {isLogoutModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-[#1b223e]/95 p-6 text-white shadow-2xl backdrop-blur-md">
            <h3 className="text-xl font-semibold">Выйти из системы?</h3>
            <p className="mt-2 text-sm text-white/75">Вы точно хотите выйти из аккаунта?</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(false)}
                className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleLogoutConfirm}
                className="rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2 text-sm text-red-200 transition-colors hover:bg-red-500/30"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ShopModal
        open={isShopOpen}
        onClose={() => setIsShopOpen(false)}
        catalog={shopCatalog}
        state={shopState}
        busyId={shopBusyId}
        onBuy={buyItem}
        onEquip={equipItem}
      />
    </div>
  );
}
