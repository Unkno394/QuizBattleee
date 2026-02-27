'use client';

import './auth.css';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import Modal from '@/shared/ui/Modal';
import { useAlert } from '../components/CustomAlert';
import {
  login,
  register,
  forgotPassword,
  verifyResetCode,
  resetPassword,
} from '@/shared/api/auth';

export default function LoginForm() {
  const [isActive, setIsActive] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [loginError, setLoginError] = useState<string>('');
  const [registerError, setRegisterError] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStep, setResetStep] = useState<'request' | 'verify' | 'reset'>('request');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const { AlertComponent, notify } = useAlert();

  // состояние для глазиков
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);

  const router = useRouter();

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  };

  const validatePasswordPolicy = (password: string): string | null => {
    if (password.length < 8) {
      return 'Пароль должен содержать минимум 8 символов.';
    }
    if (!/[A-Za-z]/.test(password)) {
      return 'Пароль должен содержать хотя бы одну английскую букву.';
    }
    return null;
  };

  const handleRegisterClick = (): void => {
    setIsActive(true);
    setLoginError('');
    setRegisterError('');
  };

  const handleLoginClick = (): void => {
    setIsActive(false);
    setLoginError('');
    setRegisterError('');
  };

  const handleForgotClick = () => {
    setShowResetModal(true);
    setResetStep('request');
    setResetMessage('');
    setResetError('');
    setResetEmail('');
    setResetToken('');
    setShowResetNewPassword(false);
    setShowResetConfirmPassword(false);
  };

  const handleLoginSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    console.log('[auth] login submit start');
    setLoginLoading(true);
    setLoginError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const data = await login({ email, password });
      localStorage.setItem('access_token', data?.access_token);
      notify('Добро пожаловать!', 'success');
      router.push('/');
    } catch (error: unknown) {
      console.error('[auth] login error', error);
      const msg = getErrorMessage(error, 'Ошибка при входе');
      setLoginError(msg);
      notify(msg, 'error');
    } finally {
      setLoginLoading(false);
      console.log('[auth] login submit end');
    }
  };

  const handleForgotSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    console.log('[auth] forgot submit start');
    setResetLoading(true);
    setResetError('');
    setResetMessage('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;

    try {
      await forgotPassword(email);
      setResetEmail(email);
      setResetMessage('Письмо с кодом отправлено. Проверьте почту.');
      setResetStep('verify');
      notify('Письмо с кодом отправлено. Проверьте почту.', 'success');
    } catch (error: unknown) {
      console.error('[auth] forgot error', error);
      const msg = getErrorMessage(error, 'Не удалось отправить письмо');
      setResetError(msg);
      notify(msg, 'error');
    } finally {
      setResetLoading(false);
      console.log('[auth] forgot submit end');
    }
  };

  const handleVerifySubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    console.log('[auth] verify submit start');
    setResetLoading(true);
    setResetError('');
    setResetMessage('');

    const formData = new FormData(e.currentTarget);
    const token = formData.get('code') as string;

    try {
      await verifyResetCode(resetEmail, token);
      setResetMessage('Код подтверждён. Введите новый пароль.');
      setResetToken(token);
      setResetStep('reset');
      notify('Код подтверждён. Введите новый пароль.', 'success');
    } catch (error: unknown) {
      console.error('[auth] verify error', error);
      const msg = getErrorMessage(error, 'Неверный или истёкший код');
      setResetError(msg);
      notify(msg, 'error');
    } finally {
      setResetLoading(false);
      console.log('[auth] verify submit end');
    }
  };

  const handleResetSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    console.log('[auth] reset submit start');
    setResetLoading(true);
    setResetError('');
    setResetMessage('');

    const formData = new FormData(e.currentTarget);
    const new_password = formData.get('new_password') as string;
    const new_password_confirm = formData.get('new_password_confirm') as string;

    if (new_password !== new_password_confirm) {
      const msg = 'Пароли не совпадают';
      setResetError(msg);
      notify(msg, 'warning');
      setResetLoading(false);
      return;
    }

    const resetPasswordPolicyError = validatePasswordPolicy(new_password);
    if (resetPasswordPolicyError) {
      setResetError(resetPasswordPolicyError);
      notify(resetPasswordPolicyError, 'warning');
      setResetLoading(false);
      return;
    }

    try {
      await resetPassword({ email: resetEmail, token: resetToken, new_password, new_password_confirm });
      setResetMessage('Пароль успешно обновлён. Можно войти.');
      setShowResetModal(false);
      setIsActive(false);
      notify('Пароль успешно обновлён. Можно войти.', 'success');
    } catch (error: unknown) {
      console.error('[auth] reset error', error);
      const msg = getErrorMessage(error, 'Не удалось сбросить пароль');
      setResetError(msg);
      notify(msg, 'error');
    } finally {
      setResetLoading(false);
      console.log('[auth] reset submit end');
    }
  };

  const handleRegisterSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    console.log('[auth] register submit start');
    setRegisterLoading(true);
    setRegisterError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const display_name = (formData.get('display_name') as string).trim();

    if (!display_name) {
      const msg = 'Введите имя.';
      setRegisterError(msg);
      notify(msg, 'warning');
      setRegisterLoading(false);
      return;
    }

    const registerPasswordPolicyError = validatePasswordPolicy(password);
    if (registerPasswordPolicyError) {
      setRegisterError(registerPasswordPolicyError);
      notify(registerPasswordPolicyError, 'warning');
      setRegisterLoading(false);
      return;
    }

    try {
      const payload = {
        full_name: display_name,
        email,
        password,
        password_confirm: password
      };

      console.log('[auth] register payload', payload);
      await register(payload);
      setConfirmEmail(email);
      setShowConfirmModal(true);
      setIsActive(false);
      notify('Код отправлен на почту. Подтвердите email.', 'info');
    } catch (error: unknown) {
      console.error('[auth] register error', error);
      const msg = getErrorMessage(error, 'Ошибка при регистрации');
      setRegisterError(msg);
      notify(msg, 'error');
    } finally {
      setRegisterLoading(false);
      console.log('[auth] register submit end');
    }
  };

  // Открытие модального окна для сброса пароля
  return (
    <div className="w-screen h-screen flex justify-center items-center bg-[#12172f] relative">
      <div className="fixed inset-0 w-full h-full -z-10" />

      <AlertComponent />

      <div className={`form-container ${isActive ? 'active' : ''}`}>
        {/* ----------- ЛОГИН ----------- */}
        <div className="form-box login">
          <form onSubmit={handleLoginSubmit} className="w-full max-w-[400px]">
            <h1 style={{ fontSize: '36px', margin: '-10px 0 15px 0', color: 'white' }}>Вход</h1>

            {loginError && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 text-red-200 rounded text-sm backdrop-blur-sm">
                {loginError}
              </div>
            )}

            <div className="input-box">
              <input type="email" name="email" placeholder="Email" required />
              <i className="bx bxs-envelope" />
            </div>

            <div className="input-box relative">
              <input
                type={showLoginPassword ? 'text' : 'password'}
                name="password"
                placeholder="Пароль"
                required
                className="pr-10"
              />
              <i className="bx bxs-lock-alt" />

              <button
                type="button"
                onClick={() => setShowLoginPassword((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center"
                style={{ color: '#000' }}
              >
                {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div className="text-right mb-2">
              <button
                type="button"
                onClick={handleForgotClick}
                className="text-sm text-indigo-200 hover:text-white underline"
                disabled={resetLoading}
              >
                Забыли пароль?
              </button>
            </div>

            <button
              type="submit"
              className="glass-btn"
              style={{ width: '100%', height: '48px' }}
              disabled={loginLoading}
            >
              {loginLoading ? 'Загрузка...' : 'Войти'}
            </button>
          </form>
        </div>

        {/* ----------- РЕГИСТРАЦИЯ ----------- */}
        <div className="form-box register">
          <form onSubmit={handleRegisterSubmit} className="w-full max-w-[400px]">
            <h1 style={{ fontSize: '36px', margin: '-10px 0 15px 0', color: 'white' }}>
              Регистрация
            </h1>

            {registerError && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 text-red-200 rounded text-sm backdrop-blur-sm">
                {registerError}
              </div>
            )}

            <div className="input-box">
              <input
                type="text"
                name="display_name"
                placeholder="Имя"
                required
              />
              <i className="bx bxs-user" />
            </div>

            <div className="input-box">
              <input type="email" name="email" placeholder="Email" required />
              <i className="bx bxs-envelope" />
            </div>

            <div className="input-box relative">
              <input
                type={showRegisterPassword ? 'text' : 'password'}
                name="password"
                placeholder="Пароль"
                required
                className="pr-10"
              />
              <i className="bx bxs-lock-alt" />

              <button
                type="button"
                onClick={() => setShowRegisterPassword((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center"
                style={{ color: '#000' }}
              >
                {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button
              type="submit"
              className="glass-btn"
              style={{ width: '100%', height: '48px' }}
              disabled={registerLoading}
            >
              {registerLoading ? 'Загрузка...' : 'Зарегистрироваться'}
            </button>
          </form>
        </div>

        {/* ----------- ПАНЕЛИ ПЕРЕКЛЮЧЕНИЯ ----------- */}
        <div className="toggle-box">
          <div className="toggle-panel toggle-left">
            <h1 style={{ fontSize: '36px', marginBottom: '15px' }}>Добро пожаловать!</h1>
            <p style={{ marginBottom: '20px' }}>Нет аккаунта?</p>
            <button
              className="glass-btn"
              onClick={handleRegisterClick}
              style={{ width: '160px', height: '46px' }}
              disabled={loginLoading || registerLoading}
            >
              Регистрация
            </button>
          </div>

          <div className="toggle-panel toggle-right">
            <h1 style={{ fontSize: '36px', marginBottom: '15px' }}>С возвращением!</h1>
            <p style={{ marginBottom: '20px' }}>Уже есть аккаунт?</p>
            <button
              className="glass-btn"
              onClick={handleLoginClick}
              style={{ width: '160px', height: '46px' }}
              disabled={loginLoading || registerLoading}
            >
              Войти
            </button>
          </div>
        </div>
      </div>

      {showConfirmModal && (
        <Modal
          email={confirmEmail}
          onVerified={() => {
            setShowConfirmModal(false);
            notify('Почта подтверждена. Теперь можно войти.', 'success');
          }}
        />
      )}

      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fadeIn">
          <div className="bg-[#1a1a1a] p-6 rounded-lg shadow-lg w-[360px] text-center">
            <h2 className="text-2xl text-white mb-4">
              {resetStep === 'request' ? 'Восстановление пароля' : 'Сбросить пароль'}
            </h2>

            {resetMessage && (
              <div className="mb-3 p-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-100 rounded text-sm">
                {resetMessage}
              </div>
            )}
            {resetError && (
              <div className="mb-3 p-2 bg-red-500/20 border border-red-500/40 text-red-200 rounded text-sm">
                {resetError}
              </div>
            )}

            <form
              onSubmit={
                resetStep === 'request'
                  ? handleForgotSubmit
                  : resetStep === 'verify'
                  ? handleVerifySubmit
                  : handleResetSubmit
              }
              className="space-y-3 text-left"
            >
              <div className="input-box">
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  required
                  value={resetEmail}
                  disabled={resetStep !== 'request'}
                  onChange={e => setResetEmail(e.target.value)}
                />
                <i className="bx bxs-envelope" />
              </div>

              {resetStep !== 'request' && (
                <div className="input-box">
                  <input
                    type="text"
                    name="code"
                    placeholder="Код из письма"
                    required
                    disabled={resetStep === 'reset'}
                    defaultValue={resetToken}
                  />
                  <i className="bx bxs-key" />
                </div>
              )}

              {resetStep === 'reset' && (
                <>
                  <div className="input-box relative">
                    <input
                      type={showResetNewPassword ? 'text' : 'password'}
                      name="new_password"
                      placeholder="Новый пароль"
                      required
                      className="pr-10"
                    />
                    <i className="bx bxs-lock-alt" />
                    <button
                      type="button"
                      onClick={() => setShowResetNewPassword((value) => !value)}
                      className="absolute inset-y-0 right-3 flex items-center"
                      style={{ color: '#000' }}
                    >
                      {showResetNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="input-box relative">
                    <input
                      type={showResetConfirmPassword ? 'text' : 'password'}
                      name="new_password_confirm"
                      placeholder="Подтвердите пароль"
                      required
                      className="pr-10"
                    />
                    <i className="bx bxs-lock-alt" />
                    <button
                      type="button"
                      onClick={() => setShowResetConfirmPassword((value) => !value)}
                      className="absolute inset-y-0 right-3 flex items-center"
                      style={{ color: '#000' }}
                    >
                      {showResetConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </>
              )}

              <button
                type="submit"
                className="w-full py-2 bg-[#191538] text-white rounded-md hover:bg-[#4a2d77] disabled:bg-gray-500"
                disabled={resetLoading}
              >
                {resetStep === 'request'
                  ? resetLoading
                    ? 'Отправка...'
                    : 'Отправить код'
                  : resetStep === 'verify'
                  ? resetLoading
                    ? 'Проверка...'
                    : 'Подтвердить код'
                  : resetLoading
                  ? 'Сброс...'
                  : 'Сбросить пароль'}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-white/60">
              Сброс пароля завершится после подтверждения кода и ввода нового пароля.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
