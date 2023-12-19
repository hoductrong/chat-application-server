export class ExtendedError extends Error {
  data: any;
  status: number;
  constructor(message?: string, data?: any) {
    super(message);
    this.data = data;
    this.status = data.status;
  }
}
