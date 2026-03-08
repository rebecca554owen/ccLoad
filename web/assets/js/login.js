(function() {
    const form = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const loginButton = document.getElementById('login-button');
    const passwordInput = document.getElementById('password');

    // 动画持续时间常量
    const ANIMATION_DURATION = 500;

    /**
     * 触发元素动画
     * @param {HTMLElement} element - 目标元素
     * @param {string} animationName - 动画名称
     * @param {number} duration - 动画持续时间(ms)
     */
    function triggerAnimation(element, animationName, duration = 500) {
      element.style.animation = 'none';
      element.offsetHeight; // 触发重绘
      element.style.animation = `${animationName} ${duration}ms ease-in-out`;
    }

    function showError(message) {
      if (window.showError) try { window.showError(message); } catch (_) {}
      errorText.textContent = message;
      errorMessage.style.display = 'flex';

      // 添加摇晃动画
      triggerAnimation(errorMessage, 'slideInUp', 300);
    }

    function hideError() {
      errorMessage.style.display = 'none';
    }

    function setLoading(loading) {
      loginButton.classList.toggle('loading', loading);
      loginButton.disabled = loading;
      passwordInput.disabled = loading;
    }

    function getSafeRedirectPath(redirect) {
      if (!redirect || typeof redirect !== 'string') return '/web/index.html';

      const candidate = redirect.trim();
      if (!candidate.startsWith('/') || candidate.startsWith('//')) {
        return '/web/index.html';
      }

      try {
        const url = new URL(candidate, window.location.origin);
        if (url.origin !== window.location.origin) return '/web/index.html';
        return `${url.pathname}${url.search}${url.hash}`;
      } catch (_) {
        return '/web/index.html';
      }
    }

    // 表单提交处理
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();
      setLoading(true);

      const password = passwordInput.value;

      try {
        const resp = await fetchAPI('/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password }),
        });

        if (resp.success) {
          const data = resp.data || {};

          // 存储Token到localStorage
          localStorage.setItem('ccload_token', data.token);
          localStorage.setItem('ccload_token_expiry', Date.now() + data.expiresIn * 1000);

          // 登录成功，添加成功动画
          loginButton.style.background = 'linear-gradient(135deg, var(--success-500), var(--success-600))';

          setTimeout(() => {
            const urlParams = new URLSearchParams(window.location.search);
            const redirect = getSafeRedirectPath(urlParams.get('redirect'));
            window.location.href = redirect;
          }, 500);
        } else {
          showError(resp.error || '密码错误，请重试');

          // 添加输入框摇晃动画
          triggerAnimation(passwordInput, 'shake', ANIMATION_DURATION);

          setTimeout(() => {
            passwordInput.style.animation = '';
          }, ANIMATION_DURATION);
        }
      } catch (error) {
        console.error('Login error:', error);
        showError('网络连接错误，请检查网络后重试');
      } finally {
        setLoading(false);
      }
    });

    // 输入框焦点处理
    passwordInput.addEventListener('focus', hideError);
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideError();
      }
    });

    // 检查URL参数中的错误信息
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    if (errorParam) {
      showError(errorParam);
    }

    /**
     * 初始化登录页面
     */
    function initLoginPage() {
      if (window.i18n) window.i18n.translatePage();
      // 聚焦到密码输入框
      setTimeout(() => {
        passwordInput.focus();
      }, ANIMATION_DURATION);

      // 添加输入框摇晃动画关键帧
      const style = document.createElement('style');
      style.textContent = `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
          20%, 40%, 60%, 80% { transform: translateX(8px); }
        }
      `;
      document.head.appendChild(style);
    }

    // 页面加载完成后的初始化
    document.addEventListener('DOMContentLoaded', initLoginPage);
})();
