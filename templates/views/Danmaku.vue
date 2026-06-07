<template>
  <div class="d-flex flex-column danmaku" id="widget" ref="widget" :class="hidden">
    <div class="align-self-start word"
      :style="wordStyle"
      :class="[color || defaultColor, { deepened: isDeepened }]"
      :activated="activated"
      @mousedown="mouseDownWord"
    >
      <span>{{ word }}</span>
      <span class="ms-1" v-if="isParaphrase">{{ brief(paraphrase) }}</span>
    </div>

    <div class="align-self-start card mt-2" style="width: 18rem;" v-if="activated">
      <div class="card-body">
        <div>
          <span class="fw-bold me-2">{{ word }}</span>
          <span v-if="phonetic">
            [{{ phonetic }}]
            <a @click="pronounce" class="bi bi-volume-up pronounce" href="#"></a>
          </span>
        </div>
        <p v-html="paraphrase"></p>

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

        <div v-for="(dict, i) in dictionaries" :key="i">
          <a @click="clickDictionary" href="#" :index="i"> {{ dict.name }} </a>
        </div>
      </div>
      <div class="d-flex flex-column">
        <div class="d-flex justify-content-evenly">
          <div v-for="(c, i) in colors" :key="i">
            <input class="radio" type="radio" name="color" :id="'radio-' + c" :value="c" hidden v-model="color" @change="clickColor"/>
            <label :for="'radio-' + c" class="radio" :class="c"></label>
          </div>
        </div>

        <div class="d-flex">
          <button type="button" @click="clickMemorized" class="col m-1 btn btn-outline-secondary btn-sm">
            {{status === 0 ? 'Memorized' : 'Revoke'}}
          </button>
          <button type="button" @click="toggleParaphrase" class="col m-1 btn btn-outline-secondary btn-sm">
            {{ isParaphrase ? 'Hide' : 'Show'}} paraphrase
          </button>
        </div>
        <div class="d-flex">
          <button type="button" @click="showDetail" class="col m-1 btn btn-outline-secondary btn-sm">
            Detail
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script>
import { html2text } from '../scripts/utils';
const { ipcRenderer, shell } = window.require('electron');

const urlParams = new URLSearchParams(window.location.search);

export default {
  data() {
    const show_paraphrase = urlParams.get('show_paraphrase');
    return {
      word: urlParams.get('word'),
      phonetic: urlParams.get('phonetic'),
      planID: urlParams.get('plan_id'),
      paraphrase: urlParams.get('paraphrase'),
      showParaphrase: show_paraphrase ? show_paraphrase === '1' : null,
      status: Number(urlParams.get('status')),
      color: urlParams.get('color'),
      activated: false,
      beginX: 0,
      beginY: 0,
      lastX: 0,
      lastY: 0,
      collaspe: null,
      hidden: '',

      colors: ['red', 'coral', 'orange', 'green', 'blue', 'sky', 'dark', 'white'],
      dictionaries: [],
      maxPharaphraseLen: 16,
      defaultColor: '',
      opacity: 0.5,
      wordSize: '15px',
      disableClick: false,
      defaultShowParaphrase: false,
      wordAnalysis: null,
      appearCount: Number(urlParams.get('appear_count') || 0),
    };
  },

  created() {
    document.addEventListener('mousemove', this.mouseMove);
    document.addEventListener('mouseup', this.mouseUp);

    this.fetchSettings();
    this.fetchWordAnalysis();
    ipcRenderer.on('refreshDanmaku', this.fetchSettings);
    ipcRenderer.on('pause', () => this.hidden = 'hidden');
    ipcRenderer.on('deactivate', () => this.activated = false);
  },

  mounted() {
    new ResizeObserver(this.updateSize).observe(this.$refs.widget);
    this.updateSize();
  },

  methods: {
    brief(s) {
      s = html2text(s);
      if (s.length > this.maxPharaphraseLen) {
        s = s.substr(0, this.maxPharaphraseLen) + '...';
      }
      return s;
    },

    async fetchSettings() {
      const settings = await ipcRenderer.invoke('getSettings',
        'externalDictionaries', 'danmakuTransparency', 'maxPharaphraseLen',
        'danmakuColor', 'disableClick', 'defaultShowParaphrase',
        'danmakuSize');

      this.dictionaries = settings.externalDictionaries;
      this.opacity = settings.danmakuTransparency / 100;
      this.maxPharaphraseLen = settings.maxPharaphraseLen;
      this.defaultColor = settings.danmakuColor;
      this.disableClick = settings.disableClick;
      this.defaultShowParaphrase = settings.defaultShowParaphrase;
      this.wordSize = settings.danmakuSize + 'px';
    },

    async fetchWordAnalysis() {
      try {
        this.wordAnalysis = await ipcRenderer.invoke('getWordAnalysis', this.word);
      } catch { this.wordAnalysis = null; }
    },

    mouseDownWord(e) {
      document.title = 'Danmaku-dragging';
      this.beginX = this.lastX = e.screenX;
      this.beginY = this.lastY = e.screenY;
    },
    mouseMove(e) {
      if (document.title === 'Danmaku-dragging') {
        const dx = e.screenX - this.lastX;
        const dy = e.screenY - this.lastY;
        ipcRenderer.sendSync('moveWin', dx, dy);
        this.lastX = e.screenX;
        this.lastY = e.screenY;
      }
    },
    mouseUp(e) {
      if (document.title === 'Danmaku-dragging') {
        const d = Math.abs(e.screenX - this.beginX) + Math.abs(e.screenY - this.beginY);
        if (d < 5) {
          this.clickWord(e);
        }
        document.title = this.activated ? 'Danmaku-activated' : 'Danmaku';
      }
    },

    clickWord(e) {
      if (this.disableClick) return;
      switch (e.button) {
        case 0:
          this.activated = !this.activated;
          break;
        case 2:
          this.pronounce();
          break;
      }
    },

    clickMemorized() {
      this.status = this.status === 1 ? 0 : 1;
      ipcRenderer.invoke('updateWord', this.planID, this.word, {status: this.status});
      if (this.status === 1) {
        this.activated = false;
        document.title = 'Danmaku';
      }
    },

    pronounce() {
      const c = this.word[0].toUpperCase();
      const audio = new Audio(`../assets/audio/${c}/${this.word}.mp3`);
      audio.onerror = () => {
        const u = new SpeechSynthesisUtterance(this.word);
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
      shell.openExternal(dict.url + this.word);
    },

    toggleParaphrase() {
      this.showParaphrase = !this.isParaphrase;
      ipcRenderer.invoke('updateWord', this.planID, this.word, {show_paraphrase: this.showParaphrase});
    },

    clickColor() {
      ipcRenderer.invoke('updateWord', this.planID, this.word, {color: this.color});
    },

    showDetail() {
      ipcRenderer.invoke('showWordDetail', this.word);
    },

    updateSize() {
      const widget = this.$refs.widget;
      ipcRenderer.send('setWinSize', widget.clientWidth + 10, widget.clientHeight);
    },
  },

  computed: {
    wordStyle() {
      return {
        '--danmaku-opacity': this.opacity,
        '--word-size': this.wordSize,
      };
    },

    isDeepened() {
      return this.appearCount >= 10;
    },

    isParaphrase() {
      return this.showParaphrase === null ? this.defaultShowParaphrase : this.showParaphrase;
    },
  },
};
</script>

<style scoped>
.danmaku {
  position: absolute;
}

.danmaku .word {
  white-space: nowrap;
  user-select: none;
  border-radius: 0.4em;
  padding-left: 0.33em;
  padding-right: 0.33em;
  padding-top: 0.2em;
  padding-bottom: 0.2em;
  font-size: var(--word-size);
  opacity: var(--danmaku-opacity);
  transition-duration: 0.3s;
}

.hidden {
  visibility: hidden;
  opacity: 0;
  transition: visibility 0s 0.5s, opacity 0.5s linear;
}

.danmaku .word[activated] {
  opacity: 1;
}

.danmaku .word:hover {
  opacity: 1;
}

.danmaku .word.deepened {
  border: 2px solid rgba(0, 0, 0, 0.45);
}

.danmaku .card {
  border-radius: 10px;
}

.pronounce {
  color: #6c757d;
  font-size: 1.2rem;
  vertical-align: middle;
}

.pronounce:hover {
  color: #212529;
}

label.radio {
  height: 17px;
  width: 17px;
  border-radius: 3px;
}

input.radio:checked + label.radio {
  border-style: solid;
  border-width: 2px;
  border-color: black;
}

input.radio:checked + label.radio.dark {
  border-color: orange;
}

.red {
  background-color: #ff4757;
  color: #ffffff;
}
.coral {
  background-color: #ff7f50;
  color: #ffffff;
}
.orange {
  background-color: #ffa502;
  color: #ffffff;
}
.green {
  background-color: #2ed573;
  color: #ffffff;
}
.blue {
  background-color: #1e90ff;
  color: #ffffff;
}
.sky {
  background-color: #5352ed;
  color: #ffffff;
}
.dark {
  background-color: #2f3542;
  color: #ffffff;
}
.white {
  background-color: #ecf0f1;
  border-style: solid;
  border-width: 1px;
  border-color: rgba(0, 0, 0, 0.125);
  color: #000000;
}

/* Word Analysis */
.word-analysis {
  font-size: 0.85rem;
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
  font-size: 0.7rem;
  color: #7f8c8d;
}
.word-analysis .sep {
  font-weight: bold;
  color: #95a5a6;
}
</style>
