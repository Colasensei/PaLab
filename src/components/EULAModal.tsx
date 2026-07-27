import React, { useState } from 'react';
import { Lang } from '@/utils/lang';

interface Props {
  lang: Lang;
  onAgree: () => void;
}

export const EULAModal: React.FC<Props> = ({ lang, onAgree }) => {
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
      setScrolled(true);
    }
  };

  return (
    <div className="eula-overlay">
      <div className="eula-modal">
        <div className="eula-title">{lang === 'zh' ? '用户协议与免责声明' : 'Terms of Service & Disclaimer'}</div>
        <div className="eula-body" onScroll={handleScroll}>
          {lang === 'zh' ? (
            <>
              <h3>一、总则</h3>
              <p>欢迎使用 Palab（以下简称"本软件"）。本协议是您（以下简称"用户"）与 Palab 开发团队（以下简称"开发者"）之间关于使用本软件所订立的协议。在开始使用本软件之前，请您务必仔细阅读并充分理解本协议各条款内容，特别是涉及免除或限制开发者责任的条款、对用户权利进行限制的条款、约定争议解决方式和司法管辖的条款。</p>
              <p>当您点击"同意"按钮或实际使用本软件时，即表示您已阅读、理解并接受本协议的全部内容，本协议即在您与开发者之间产生法律效力。如果您不同意本协议的任何条款，请立即停止使用本软件并卸载删除。</p>
              <p>本软件是一款下落式节奏游戏（Rhythm Game），灵感来源于 Phigros 等知名音游。本软件允许用户导入自定义谱面（Chart）和音频文件进行游戏体验，并支持用户自行创建和分享谱面内容。本软件仅供个人学习、研究和娱乐目的使用。</p>

              <h3>二、知识产权声明</h3>
              <p>本软件的源代码、界面设计、Logo、名称（Palab）及相关图形素材的著作权归开发者所有，受《中华人民共和国著作权法》和国际著作权条约的保护。未经开发者明确书面授权，任何个人或组织不得对本软件进行反向工程、反编译、破解、修改、复制、分发或创建衍生作品。</p>
              <p>用户在使用本软件过程中自行导入的音频文件、图片文件（封面、曲绘）以及自行创建的谱面数据，其知识产权归原始权利人所有。用户应当确保其拥有导入和使用该等内容所必需的全部合法权利和授权。</p>
              <p>用户通过本软件创建并导出的谱面包（.zip 格式），其谱面数据部分的编排和创作成果归用户所有。用户可自由分享、分发其创作的谱面数据。但谱面包中所包含的音频文件和图片文件，用户必须确保其分享行为不侵犯任何第三方的知识产权。</p>

              <h3>三、用户行为规范</h3>
              <p>用户在使用本软件时，应遵守中华人民共和国及相关国家和地区的法律法规，不得利用本软件从事任何违法违规活动，包括但不限于：</p>
              <p>（1）导入、创建或传播含有侵犯他人知识产权、肖像权、名誉权、隐私权等合法权益内容的谱面或音频；</p>
              <p>（2）利用本软件传播含有色情、暴力、恐怖、赌博、诈骗、毒品等违法违规内容；</p>
              <p>（3）利用本软件进行任何形式的商业盈利活动，未经开发者许可；</p>
              <p>（4）干扰、破坏或试图干扰、破坏本软件的正常运行；</p>
              <p>（5）利用本软件从事任何可能对互联网安全造成危害的行为。</p>
              <p>用户应当自行对其导入的音频文件和图片文件承担全部法律责任。开发者不对用户导入的任何内容进行审查、存储或分发，亦不对用户导入内容的合法性承担任何责任。</p>

              <h3>四、免责声明</h3>
              <p>本软件按"现状"（AS IS）提供，不作任何形式的明示或默示保证，包括但不限于对适销性、特定用途适用性、不侵权性的默示保证。开发者不保证本软件的功能将满足用户的所有需求，也不保证本软件的运行不会中断或出现错误。</p>
              <p>在任何情况下，开发者均不对因使用或无法使用本软件而产生的任何直接、间接、附带、特殊、惩罚性或后果性损害（包括但不限于数据丢失、设备损坏、利润损失、业务中断）承担责任，即使开发者已被告知此类损害的可能性。</p>
              <p>用户在使用本软件过程中所产生的任何版权纠纷、侵权争议或其他法律问题，均由用户自行承担全部法律责任和经济赔偿。开发者不承担任何连带责任。</p>
              <p>由于本软件允许用户自行导入音频文件，用户确认并同意：如因用户导入未经授权的音乐作品而导致版权方提起侵权诉讼或索赔，用户将独立应诉并承担全部赔偿责任，并赔偿开发者因此遭受的全部损失（包括但不限于律师费、诉讼费、赔偿金）。</p>

              <h3>五、隐私政策</h3>
              <p>本软件重视用户隐私。本软件的所有数据（包括但不限于个人设置、游戏记录、谱面数据、导入的音频和图片文件）均存储在用户本地设备的浏览器存储（localStorage / IndexedDB）中。开发者不会收集、上传、存储或分享用户的任何个人数据或使用数据。</p>
              <p>本软件不需要用户注册账号，不需要连接互联网即可正常使用全部功能。本软件不包含任何形式的广告、追踪器或分析工具。</p>

              <h3>六、更新与终止</h3>
              <p>开发者保留随时更新、修改或终止本软件及其相关服务的权利，无需事先通知用户。开发者有权在任何时候修改本协议条款，修改后的条款一经发布即生效。用户继续使用本软件即表示接受修改后的条款。</p>

              <h3>七、适用法律与争议解决</h3>
              <p>本协议的订立、执行、解释及争议解决均适用中华人民共和国法律。因本协议引起的或与本协议有关的任何争议，双方应首先友好协商解决；协商不成的，任何一方均可向开发者所在地有管辖权的人民法院提起诉讼。</p>

              <h3>八、其他</h3>
              <p>本协议构成双方就本软件使用的完整协议，取代之前所有口头或书面的沟通、提议和协议。如本协议的任何条款被认定为无效或不可执行，该条款应在必要的最小范围内予以限制或删除，其余条款仍保持完全有效。</p>
              <p>开发者对本协议拥有最终解释权。</p>
              <p style={{ textAlign: 'center', marginTop: 16, color: '#888' }}>— Palab 开发团队 —</p>
            </>
          ) : (
            <>
              <h3>1. General</h3>
              <p>Welcome to Palab ("the Software"). This agreement is between you ("User") and the Palab development team ("Developer"). By clicking "Agree" or using the Software, you acknowledge that you have read, understood, and agree to be bound by all terms of this agreement.</p>
              <p>Palab is a vertical-scrolling rhythm game inspired by titles such as Phigros. It allows users to import custom charts and audio files for gameplay, and to create and share chart content. The Software is provided for personal learning, research, and entertainment purposes only.</p>

              <h3>2. Intellectual Property</h3>
              <p>The Software's source code, interface design, logo, name (Palab), and related graphical assets are the intellectual property of the Developer, protected by copyright laws and international treaties. Reverse engineering, decompilation, modification, copying, distribution, or creation of derivative works without explicit written permission from the Developer is strictly prohibited.</p>
              <p>Audio files, images, and chart data imported by the User remain the intellectual property of their original rights holders. Users must ensure they possess all necessary legal rights and authorizations to use such content.</p>
              <p>Chart data created and exported by the User belongs to the User and may be freely shared. However, Users must ensure that sharing audio or image files within chart packages does not infringe upon any third-party intellectual property rights.</p>

              <h3>3. User Conduct</h3>
              <p>Users shall comply with all applicable laws and regulations and shall not use the Software for any illegal activities, including but not limited to copyright infringement, distribution of illegal content, or unauthorized commercial use.</p>

              <h3>4. Disclaimer of Warranty</h3>
              <p>THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. IN NO EVENT SHALL THE DEVELOPER BE LIABLE FOR ANY DAMAGES ARISING FROM THE USE OF THIS SOFTWARE. USERS BEAR SOLE LEGAL RESPONSIBILITY FOR ANY COPYRIGHT DISPUTES ARISING FROM THEIR USE OF THE SOFTWARE.</p>

              <h3>5. Privacy</h3>
              <p>All user data is stored locally on the user's device. The Developer does not collect, upload, store, or share any personal data. No account registration or internet connection is required.</p>

              <h3>6. Governing Law</h3>
              <p>This agreement shall be governed by the laws of the People's Republic of China. Any disputes shall be resolved through friendly negotiation first, failing which either party may bring suit in a competent court.</p>
              <p style={{ textAlign: 'center', marginTop: 16, color: '#888' }}>— Palab Development Team —</p>
            </>
          )}
        </div>
        <button
          className="btn btn-primary eula-agree-btn"
          disabled={!scrolled}
          onClick={onAgree}
          style={{ opacity: scrolled ? 1 : 0.4 }}
        >
          {lang === 'zh'
            ? (scrolled ? '我已阅读并同意' : '请先阅读完协议')
            : (scrolled ? 'I have read and agree' : 'Please read the agreement first')}
        </button>
      </div>
    </div>
  );
};
