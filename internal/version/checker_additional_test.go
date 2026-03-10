package version

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"strconv"
	"sync/atomic"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type signalReadCloser struct {
	rc      io.ReadCloser
	onClose func()
}

func (s *signalReadCloser) Read(p []byte) (int, error) { return s.rc.Read(p) }

func (s *signalReadCloser) Close() error {
	if s.onClose != nil {
		s.onClose()
		s.onClose = nil
	}
	return s.rc.Close()
}

func httpResp(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Status:     strconv.Itoa(status),
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewBufferString(body)),
	}
}

func TestChecker_Check_ErrorsAndSuccess(t *testing.T) {
	origVersion := Version
	t.Cleanup(func() { Version = origVersion })

	t.Run("client error", func(t *testing.T) {
		c := &Checker{
			client: &http.Client{
				Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					return nil, errors.New("boom")
				}),
			},
		}
		c.check()
		if c.lastCheck != (time.Time{}) {
			t.Fatalf("expected lastCheck untouched on error, got %v", c.lastCheck)
		}
	})

	t.Run("non-200", func(t *testing.T) {
		c := &Checker{
			client: &http.Client{
				Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					return httpResp(http.StatusTooManyRequests, "{}"), nil
				}),
			},
		}
		c.check()
		if c.latestVersion != "" || c.releaseURL != "" || c.hasUpdate {
			t.Fatalf("expected no state update on non-200, got latest=%q url=%q hasUpdate=%v", c.latestVersion, c.releaseURL, c.hasUpdate)
		}
	})

	t.Run("bad json", func(t *testing.T) {
		c := &Checker{
			client: &http.Client{
				Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					return httpResp(http.StatusOK, "{"), nil
				}),
			},
		}
		c.check()
		if c.latestVersion != "" || c.releaseURL != "" || c.hasUpdate {
			t.Fatalf("expected no state update on bad json, got latest=%q url=%q hasUpdate=%v", c.latestVersion, c.releaseURL, c.hasUpdate)
		}
	})

	t.Run("success no update", func(t *testing.T) {
		Version = "v1.2.3"
		c := &Checker{
			client: &http.Client{
				Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					if req.Header.Get("Accept") == "" || req.Header.Get("User-Agent") == "" {
						t.Fatalf("expected headers set, got Accept=%q UA=%q", req.Header.Get("Accept"), req.Header.Get("User-Agent"))
					}
					return httpResp(http.StatusOK, `{"tag_name":"v1.2.3","html_url":"https://example.com/release"}`), nil
				}),
			},
		}
		c.check()
		if c.latestVersion != "v1.2.3" || c.releaseURL != "https://example.com/release" {
			t.Fatalf("unexpected state: latest=%q url=%q", c.latestVersion, c.releaseURL)
		}
		if c.hasUpdate {
			t.Fatalf("expected hasUpdate=false when versions equal")
		}
		if c.lastCheck.IsZero() {
			t.Fatalf("expected lastCheck set")
		}
	})

	t.Run("success has update", func(t *testing.T) {
		Version = "v1.0.0"
		c := &Checker{
			client: &http.Client{
				Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					return httpResp(http.StatusOK, `{"tag_name":"v2.0.0","html_url":"https://example.com/release2"}`), nil
				}),
			},
		}
		c.check()
		if !c.hasUpdate || c.latestVersion != "v2.0.0" || c.releaseURL != "https://example.com/release2" {
			t.Fatalf("unexpected state: hasUpdate=%v latest=%q url=%q", c.hasUpdate, c.latestVersion, c.releaseURL)
		}
	})
}

func TestStartChecker_RunsCheckOnce(t *testing.T) {
	origVersion := Version
	origClient := checker.client
	t.Cleanup(func() {
		Version = origVersion
		checker.client = origClient
	})

	Version = "v1.0.0"

	var calls int32
	done := make(chan struct{})
	checker.client = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			atomic.AddInt32(&calls, 1)
			resp := httpResp(http.StatusOK, `{"tag_name":"v2.0.0","html_url":"https://example.com/release"}`)
			resp.Body = &signalReadCloser{
				rc: resp.Body,
				onClose: func() {
					select {
					case <-done:
					default:
						close(done)
					}
				},
			}
			return resp, nil
		}),
	}

	StartChecker()

	select {
	case <-done:
	case <-time.After(1 * time.Second):
		t.Fatalf("expected StartChecker to run check at least once")
	}

	if atomic.LoadInt32(&calls) == 0 {
		t.Fatalf("expected StartChecker to issue at least one HTTP call")
	}
	checker.mu.RLock()
	lastCheck := checker.lastCheck
	checker.mu.RUnlock()
	if lastCheck.IsZero() {
		t.Fatalf("expected lastCheck to be set")
	}
}

func TestIsNewerVersion(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		current  string
		latest   string
		wantNewer bool
	}{
		// dev 版本不参与比较
		{"dev vs latest", "dev", "v2.0.0", false},
		{"latest vs dev", "v2.0.0", "dev", false},
		{"dev vs dev", "dev", "dev", false},

		// 空版本不参与比较
		{"empty vs latest", "", "v2.0.0", false},
		{"latest vs empty", "v2.0.0", "", false},

		// 相同版本
		{"same version", "v1.2.3", "v1.2.3", false},

		// 主版本升级
		{"major upgrade", "v1.0.0", "v2.0.0", true},
		{"major downgrade", "v2.0.0", "v1.0.0", false},

		// 次版本升级
		{"minor upgrade", "v1.0.0", "v1.1.0", true},
		{"minor downgrade", "v1.1.0", "v1.0.0", false},

		// 补丁版本升级
		{"patch upgrade", "v1.1.0", "v1.1.1", true},
		{"patch downgrade", "v1.1.1", "v1.1.0", false},

		// v 前缀兼容性
		{"without v prefix", "1.0.0", "v2.0.0", true},
		{"both without v", "1.0.0", "2.0.0", true},

		// 无法解析的版本
		{"invalid current", "invalid", "v2.0.0", false},
		{"invalid latest", "v1.0.0", "invalid", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isNewerVersion(tt.current, tt.latest)
			if got != tt.wantNewer {
				t.Fatalf("isNewerVersion(%q, %q) = %v, want %v", tt.current, tt.latest, got, tt.wantNewer)
			}
		})
	}
}
