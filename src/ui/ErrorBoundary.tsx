import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** 出错时显示的区域名称，用于提示用户是哪部分坏了 */
  areaName: string;
}

interface State {
  error: Error | null;
}

/**
 * 局部错误边界。
 *
 * 用途：渲染层（Konva）出问题时只让该区域降级，而不是整个应用白屏。
 * 拼图工具的编辑内容全在内存里，白屏会让用户以为数据丢了，
 * 因此宁可让画布区域显示错误信息，也要保住资源库与属性面板可用。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 控制台留档便于排查；不上报任何外部服务（禁止遥测）
    console.error(`[${this.props.areaName}] 渲染失败`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-box">
          <div>{this.props.areaName}渲染失败</div>
          <div className="report__hint">{this.state.error.message}</div>
          <button onClick={() => this.setState({ error: null })}>重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}
