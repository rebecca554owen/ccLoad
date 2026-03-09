const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModalsSandbox({ redirectTableData, redirectTableBody }) {
  const source = fs.readFileSync(path.join(__dirname, 'channels-modals.js'), 'utf8');
  const sandbox = {
    console,
    redirectTableData,
    selectedModelIndices: new Set(),
    currentModelFilter: '',
    inlineURLTableData: [''],
    inlineKeyTableData: [''],
    currentChannelKeyCooldowns: [],
    channelFormDirty: false,
    editingChannelId: null,
    channels: [],
    filters: { channelType: 'all' },
    document: {
      getElementById(id) {
        if (id === 'redirectTableBody') return redirectTableBody;
        return null;
      },
      querySelector() {
        return null;
      }
    },
    window: {
      t(key) {
        return key;
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox;
}

test('buildModelsConfig 在保存前同步未失焦的多目标输入', () => {
  const redirectTableData = [{
    model: 'gpt-4',
    targets: [
      { target_model: 'gpt-4o', weight: 1 },
      { target_model: '', weight: 1 }
    ]
  }];

  const redirectTableBody = {
    dataset: {},
    querySelectorAll(selector) {
      if (selector === '.redirect-from-input') {
        return [{
          dataset: { index: '0' },
          value: 'gpt-4'
        }];
      }
      if (selector === '.target-model-input') {
        return [
          {
            dataset: { modelIndex: '0', targetIndex: '0' },
            value: 'gpt-4o'
          },
          {
            dataset: { modelIndex: '0', targetIndex: '1' },
            value: 'gpt-4.1'
          }
        ];
      }
      if (selector === '.target-weight-input') {
        return [
          {
            dataset: { modelIndex: '0', targetIndex: '0' },
            value: '1'
          },
          {
            dataset: { modelIndex: '0', targetIndex: '1' },
            value: '1'
          }
        ];
      }
      return [];
    }
  };

  const sandbox = loadModalsSandbox({ redirectTableData, redirectTableBody });
  const models = sandbox.buildModelsConfig();

  assert.equal(models.length, 1);
  assert.equal(JSON.stringify(models[0]), JSON.stringify({
    model: 'gpt-4',
    targets: [
      { target_model: 'gpt-4o', weight: 1 },
      { target_model: 'gpt-4.1', weight: 1 }
    ]
  }));
});
