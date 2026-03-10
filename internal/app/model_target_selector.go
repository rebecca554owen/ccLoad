package app

import (
	"errors"
	"math/rand/v2"
	"sync"
	"time"
)

// ModelTarget 表示一个目标模型及其权重
type ModelTarget struct {
	TargetModel string // 目标模型名称
	Weight      int    // 权重（默认1，越大被选中的概率越高）
}

// ModelTargetSelector 模型目标选择器
// 负责按权重选择目标模型，支持冷却状态检查
type ModelTargetSelector struct {
	mu        sync.RWMutex
	cooldowns map[string]time.Time // 冷却状态缓存：key -> 冷却截止时间
}

// NewModelTargetSelector 创建模型目标选择器
func NewModelTargetSelector() *ModelTargetSelector {
	return &ModelTargetSelector{
		cooldowns: make(map[string]time.Time),
	}
}

// Select 按权重选择目标模型（排除冷却中的）
// 参数:
//   - targets: 候选目标模型列表
//   - cooldownChecker: 冷却状态检查函数，返回true表示该目标在冷却中
//
// 返回:
//   - 选中的目标模型
//   - 错误（如果没有可用目标）
func (s *ModelTargetSelector) Select(
	targets []ModelTarget,
	cooldownChecker func(targetModel string) bool,
) (*ModelTarget, error) {
	if len(targets) == 0 {
		return nil, errors.New("no model targets available")
	}

	// 过滤冷却中的目标
	var available []ModelTarget
	for _, t := range targets {
		if cooldownChecker != nil && cooldownChecker(t.TargetModel) {
			continue
		}
		available = append(available, t)
	}

	// 如果所有目标都在冷却中，返回错误
	if len(available) == 0 {
		return nil, errors.New("all model targets are cooling down")
	}

	// 如果只有一个可用目标，直接返回
	if len(available) == 1 {
		return &available[0], nil
	}

	// 按权重加权随机选择
	return weightedRandomSelect(available), nil
}

// weightedRandomSelect 加权随机选择
// 权重越大被选中的概率越高
func weightedRandomSelect(targets []ModelTarget) *ModelTarget {
	if len(targets) == 0 {
		return nil
	}

	// 计算总权重
	totalWeight := 0
	for _, t := range targets {
		weight := t.Weight
		if weight <= 0 {
			weight = 1 // 默认权重为1
		}
		totalWeight += weight
	}

	if totalWeight <= 0 {
		// 所有权重都为0或负数，退化为均匀随机
		return &targets[rand.IntN(len(targets))]
	}

	// 加权随机选择
	r := rand.IntN(totalWeight)
	for i, t := range targets {
		weight := t.Weight
		if weight <= 0 {
			weight = 1
		}
		r -= weight
		if r < 0 {
			return &targets[i]
		}
	}

	// 兜底：返回最后一个
	return &targets[len(targets)-1]
}

// SetCooldown 设置目标模型的冷却状态（内存缓存）
func (s *ModelTargetSelector) SetCooldown(key string, until time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cooldowns[key] = until
}

// IsCoolingDown 检查目标模型是否在冷却中
func (s *ModelTargetSelector) IsCoolingDown(key string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	until, ok := s.cooldowns[key]
	if !ok {
		return false
	}
	return time.Now().Before(until)
}

// ClearCooldown 清除目标模型的冷却状态
func (s *ModelTargetSelector) ClearCooldown(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cooldowns, key)
}

// GC 清理过期的冷却状态
func (s *ModelTargetSelector) GC() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for key, until := range s.cooldowns {
		if now.After(until) {
			delete(s.cooldowns, key)
		}
	}
}
