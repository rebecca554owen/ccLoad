// Package version 提供版本检测服务
package version

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	// GitHub API 地址
	githubReleaseAPI = "https://api.github.com/repos/caidaoli/ccLoad/releases/latest"
	// 检测间隔
	checkInterval = 4 * time.Hour
	// 请求超时
	requestTimeout = 10 * time.Second
)

// GitHubRelease GitHub release API 响应结构
type GitHubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
}

// Checker 版本检测器
type Checker struct {
	mu            sync.RWMutex
	latestVersion string
	releaseURL    string
	hasUpdate     bool
	lastCheck     time.Time
	client        *http.Client
}

// 全局检测器实例
var checker = &Checker{
	client: &http.Client{Timeout: requestTimeout},
}

// StartChecker 启动版本检测服务
func StartChecker() {
	// 启动时立即检测一次
	go func() {
		checker.check()
		// 定时检测
		ticker := time.NewTicker(checkInterval)
		defer ticker.Stop()
		for range ticker.C {
			checker.check()
		}
	}()
}

// check 执行版本检测
func (c *Checker) check() {
	req, err := http.NewRequest(http.MethodGet, githubReleaseAPI, nil)
	if err != nil {
		log.Printf("[VersionChecker] 创建请求失败: %v", err)
		return
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "ccLoad/"+Version)

	resp, err := c.client.Do(req)
	if err != nil {
		log.Printf("[VersionChecker] 请求GitHub失败: %v", err)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[VersionChecker] GitHub返回非200状态: %d", resp.StatusCode)
		return
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		log.Printf("[VersionChecker] 解析响应失败: %v", err)
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.latestVersion = release.TagName
	c.releaseURL = release.HTMLURL
	c.lastCheck = time.Now()

	// 比较版本（dev版本不参与比较，语义版本号比较）
	c.hasUpdate = isNewerVersion(Version, release.TagName)

	if c.hasUpdate {
		log.Printf("[VersionChecker] 发现新版本: %s -> %s", Version, release.TagName)
	}
}

// normalizeVersion 标准化版本号（去掉v前缀）
func normalizeVersion(v string) string {
	return strings.TrimPrefix(strings.TrimSpace(v), "v")
}

// versionParts 语义版本号各部分
type versionParts struct {
	major int
	minor int
	patch int
}

// parseVersion 解析语义版本号为数字部分
// 返回 nil 表示无法解析（如 dev 版本）
func parseVersion(v string) *versionParts {
	v = normalizeVersion(v)
	// dev 版本不参与比较
	if v == "dev" || v == "" {
		return nil
	}
	parts := strings.Split(v, ".")
	if len(parts) < 1 || len(parts) > 3 {
		return nil
	}
	vp := &versionParts{}
	var err error
	vp.major, err = strconv.Atoi(parts[0])
	if err != nil {
		return nil
	}
	if len(parts) >= 2 {
		vp.minor, err = strconv.Atoi(parts[1])
		if err != nil {
			return nil
		}
	}
	if len(parts) >= 3 {
		vp.patch, err = strconv.Atoi(parts[2])
		if err != nil {
			return nil
		}
	}
	return vp
}

// isNewerVersion 检查 latest 是否比 current 新
// 如果任一版本无法解析（如 dev 版本），返回 false
func isNewerVersion(current, latest string) bool {
	cv := parseVersion(current)
	lv := parseVersion(latest)
	if cv == nil || lv == nil {
		return false
	}
	if lv.major != cv.major {
		return lv.major > cv.major
	}
	if lv.minor != cv.minor {
		return lv.minor > cv.minor
	}
	return lv.patch > cv.patch
}

// GetUpdateInfo 获取更新信息
func GetUpdateInfo() (hasUpdate bool, latestVersion, releaseURL string) {
	checker.mu.RLock()
	defer checker.mu.RUnlock()
	return checker.hasUpdate, checker.latestVersion, checker.releaseURL
}
