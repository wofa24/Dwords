<template>
  <div class="d-flex flex-row justify-content-center col">
    <div class="search" style="-webkit-app-region: no-drag">
      <i class="search-icon bi bi-search"></i>
      <input ref="searchBox" type="text" class="search-box" placeholder="Search" v-model="inputedWord">
    </div>

    <div class="preview-list border shadow" v-if="candidates.length > 0">
      <div class="list-group list-group-flush">
        <a v-for="(word, i) in candidates" :key="i" class="list-group-item list-group-item-action"
          :class="i === index ? 'active' : ''" href="#" @click="search(word)"
        >
          {{ word }}
        </a>
      </div>
    </div>

    <div class="modal fade" tabindex="-1" ref="modal" style="-webkit-app-region: no-drag">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-body">
            <button type="button" class="btn-close close-modal" data-bs-dismiss="modal"></button>
            <h4>{{ result.word }}</h4>
            <p v-if="result.phonetic">
              [{{ result.phonetic }}]
              <a @click="pronounce" class="bi bi-volume-up pronounce" href="#"></a>
            </p>
            <p v-html="result.paraphrase"></p>

            <!-- Word Analysis (root/affix breakdown) -->
            <div v-if="wordAnalysis && wordAnalysis.parts" class="word-analysis mt-2">
              <div class="parts d-flex flex-wrap align-items-center">
                <template v-for="(p, i) in wordAnalysis.parts">
                  <span v-if="i > 0" :key="'sep-'+i" class="sep mx-1">+</span>
                  <span :key="i" :class="'part ' + p.type">
                    <span class="text">{{ p.text || '' }}</span>
                    <span class="meaning">{{ p.meaning || '' }}</span>
                  </span>
                </template>
              </div>
            </div>

            <!-- Rich Data from remix-words-funny -->
            <div v-if="richData" class="rich-data mt-3">
              <!-- Book name -->
              <p v-if="richData.bookName" class="text-secondary small mb-2">
                {{ richData.bookName }}
              </p>
              <!-- Pronounce + Remember -->
              <p v-if="richData.remember" class="small text-muted mb-2">
                <em>{{ richData.remember }}</em>
              </p>

              <!-- Translations -->
              <div v-if="richData.translations && richData.translations.length" class="rich-section">
                <h6 class="rich-heading">翻译</h6>
                <div v-for="(t, i) in richData.translations" :key="'tr-'+i" class="rich-item mb-2">
                  <span class="badge bg-primary me-1">{{ t.pos }}</span>
                  <span>{{ t.cn }}</span>
                  <small class="text-secondary d-block">{{ t.en }}</small>
                </div>
              </div>

              <!-- Phrases -->
              <div v-if="richData.phrases && richData.phrases.length" class="rich-section">
                <h6 class="rich-heading">短语</h6>
                <div v-for="(p, i) in richData.phrases" :key="'ph-'+i" class="rich-item mb-1">
                  <div>{{ p.content }}</div>
                  <small class="text-secondary">{{ p.cn }}</small>
                </div>
              </div>

              <!-- Sentences -->
              <div v-if="richData.sentences && richData.sentences.length" class="rich-section">
                <h6 class="rich-heading">例句</h6>
                <div v-for="(s, i) in richData.sentences" :key="'se-'+i" class="rich-item mb-1">
                  <div>{{ s.content }}</div>
                  <small class="text-secondary">{{ s.cn }}</small>
                </div>
              </div>

              <!-- Synonyms -->
              <div v-if="richData.synonyms && richData.synonyms.length" class="rich-section">
                <h6 class="rich-heading">同义词</h6>
                <div v-for="(s, i) in richData.synonyms" :key="'sy-'+i" class="rich-item mb-1">
                  <span class="badge bg-secondary me-1">{{ s.pos }}</span>
                  <span>{{ s.content }}</span>
                  <span class="text-secondary ms-1">{{ s.cn }}</span>
                </div>
              </div>

              <!-- Cognates -->
              <div v-if="richData.cognates && richData.cognates.length" class="rich-section">
                <h6 class="rich-heading">同根词</h6>
                <div v-for="(c, i) in richData.cognates" :key="'co-'+i" class="rich-item mb-1">
                  <span class="badge bg-secondary me-1">{{ c.pos }}</span>
                  <span>{{ c.content }}</span>
                  <span class="text-secondary ms-1">{{ c.cn }}</span>
                </div>
              </div>
            </div>

            <div v-for="(dict, i) in dictionaries" :key="i" class="mt-2">
              <a @click="clickDictionary" href="#" :index="i"> {{ dict.name }} </a>
            </div>
          </div>

          <div v-if="result.status !== undefined" class="modal-footer p-2">
            <button class="btn btn-outline-secondary btn-sm me-2" @click="clickEdit">Edit</button>
            <button class="btn btn-outline-secondary btn-sm me-2" @click="clickMark">
              Mark as {{ result.status === 0 ? 'memorized' : 'unmemorized' }}
            </button>
          </div>
          <div v-else-if="currentPlan" class="modal-footer p-2">
            <button class="btn btn-outline-secondary btn-sm me-2" @click="addToPlan">Add to Plan</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script>
import { Modal } from 'bootstrap';
const { ipcRenderer, shell } = window.require('electron');

export default {
  data() {
    return {
      inputedWord: '',
      index: -1,
      candidates: [],
      dictionaries: [],

      result: {},
      wordAnalysis: null,
      richData: null,
    };
  },

  props: {
    currentPlan: String,
  },

  created() {
    this.fetchSettings();
  },

  mounted() {
    this.modal = new Modal(this.$refs.modal, {});

    document.addEventListener('keyup', this.onKeyUp);
    this.$parent.$on('search', this.search);
    ipcRenderer.on('showDetail', (_, word) => this.search(word));
  },

  destroyed() {
    document.removeEventListener('keyup', this.onKeyUp);
    ipcRenderer.removeAllListeners('showDetail');
  },

  methods: {
    onKeyUp(e) {
      if (e.key === 'Escape') {
        this.inputedWord = '';
      } else if (e.key === 's' || e.key === '/') {
        this.$refs.searchBox.focus();
      } else if (e.key === 'ArrowDown') {
        this.index = Math.min(this.index + 1, this.candidates.length - 1);
      } else if (e.key === 'ArrowUp') {
        this.index = Math.max(this.index - 1, Math.min(0, this.candidates.length - 1));
      } else if (e.key === 'Enter') {
        if (this.index >= 0) {
          this.search(this.candidates[this.index]);
        } else if (this.inputedWord) {
          this.search(this.inputedWord);
        }
      }
    },

    async search(word) {
      const res = await ipcRenderer.invoke('search', word);
      if (res) {
        this.result = res;
        this.modal.show();

        // Fetch word analysis (root/affix breakdown)
        try {
          this.wordAnalysis = await ipcRenderer.invoke('getWordAnalysis', word);
        } catch { this.wordAnalysis = null; }

        // Fetch rich dictionary data from remix-words-funny
        try {
          this.richData = await ipcRenderer.invoke('getWordRichData', word);
        } catch { this.richData = null; }
      }
    },

    async fetchSettings() {
      const settings = await ipcRenderer.invoke('getSettings', 'externalDictionaries');
      this.dictionaries = settings.externalDictionaries;
    },

    pronounce() {
      const word = this.result.word;
      const c = word[0].toUpperCase();
      const audio = new Audio(`../assets/audio/${c}/${word}.mp3`);
      audio.onerror = () => {
        const u = new SpeechSynthesisUtterance(word);
        u.lang = 'en-US';
        u.rate = 0.8;
        u.volume = 1;
        speechSynthesis.speak(u);
      };
      // Use AudioContext GainNode to boost volume beyond 100%
      const actx = new AudioContext();
      const src = actx.createMediaElementSource(audio);
      const gain = actx.createGain();
      gain.gain.value = 1.5;
      src.connect(gain);
      gain.connect(actx.destination);
      audio.play();
    },

    clickDictionary(e) {
      const dict = this.dictionaries[e.target.getAttribute('index')];
      shell.openExternal(dict.url + this.result.word);
    },

    clickEdit() {
      this.modal.hide();
      const query = new URLSearchParams({
        edit: this.result.word,
        plan: this.result.plan_id,
      }).toString();
      this.$router.push(`/plans?${query}`);
    },

    clickMark() {
      const res = this.result;
      res.status = res.status === 1 ? 0 : 1;
      ipcRenderer.invoke('updateWord', res.plan_id, res.word, {status: res.status});
    },

    async addToPlan() {
      const res = this.result;
      await ipcRenderer.invoke('addWord', this.currentPlan, res.word, Date.now(), res.paraphrase);
      await this.search(res.word);
    },
  },

  watch: {
    inputedWord(word) {
      if (this.inputTimer) {
        clearTimeout(this.inputTimer);
      }
      this.inputTimer = setTimeout(async () => {
        if (word) {
          this.candidates = await ipcRenderer.invoke('getWordsByPrefix', word);
        } else {
          this.candidates = [];
        }
        this.index = -1;
      }, 100);
    }
  }
};
</script>

<style scoped>
.search {
  -webkit-app-region: no-drag;
  position: relative;
}

.search-icon {
  color: gray;
  position: absolute;
  left: 0.5em;
  padding: 0.25em;
}

.search-box {
  height: .9em;
  width: 17em;
  border: 1px solid;
  border-color: rgba(0, 0, 0, 0);
  background: #eff0f1;
  border-radius: 1em;
  padding: 1em;
  padding-left: 2.2em;
  transition: .15s ease-in-out;
}

.search-box:focus {
  background-color: #fff;
  border-color: #86b7fe;
  outline: 0;
  box-shadow: 0 0 0 .25rem rgba(13,110,253,.25);
}

.preview-list {
  position: absolute;
  z-index: 10;
  top: 55px;
  width: 16rem;
  max-height: 90%;
  overflow-y: auto;
}

.close-modal {
  position: absolute;
  right: 13px;
}

.pronounce {
  color: #6c757d;
  font-size: 1.2rem;
  vertical-align: middle;
}

.pronounce:hover {
  color: #212529;
}

/* Word Analysis */
.word-analysis {
  font-size: 0.9rem;
}
.word-analysis .part {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  background: #f0f4f8;
  border-radius: 4px;
  padding: 2px 6px;
}
.word-analysis .part .text {
  font-weight: 600;
  color: #2c3e50;
}
.word-analysis .part .meaning {
  font-size: 0.75rem;
  color: #7f8c8d;
}
.word-analysis .sep {
  font-weight: bold;
  color: #95a5a6;
}

/* Rich Data Sections */
.rich-data {
  border-top: 1px solid #e9ecef;
  padding-top: 0.5rem;
}
.rich-section {
  max-height: 180px;
  overflow-y: auto;
  margin-top: 0.5rem;
  padding-right: 0.25rem;
}
.rich-heading {
  color: #495057;
  font-size: 0.85rem;
  border-bottom: 1px solid #e9ecef;
  padding-bottom: 0.2rem;
  margin-bottom: 0.4rem;
}
.rich-item {
  font-size: 0.85rem;
}

/* Modal body scroll */
.modal-body {
  max-height: 70vh;
  overflow-y: auto;
}
</style>
