export interface Message {
  senderId?: number;
  username: string;
  content: string;
  system: boolean;
  file?: {
    type: string
    url: string
    size?: number
    name?: string
    fid?: string
  };
  files: {
    type: string
    url: string
    size?: number
    name?: string
    fid?: string
  }[];
  time: number;
}
