import { defineComponent } from 'vue';
import { dateZhCN, NConfigProvider, zhCN } from 'naive-ui';
import { RouterView } from 'vue-router';

export default defineComponent({
  render() {
    return (
      <NConfigProvider locale={zhCN} dateLocale={dateZhCN}>
        <RouterView />
      </NConfigProvider>
    );
  },
});
