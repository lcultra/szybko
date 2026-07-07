export function App() {
    return (
        <div className="px-2 py-2 text-text border border-border">
            <div>
                设置
            </div>
            <div>
                <input></input>
            </div>
            {
                Array.from({ length: 100 }).map((_, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={index} className="border-b border-border">
                        <p className="text-text">
                            设置项
                            {index + 1}
                        </p>
                    </div>
                ))
            }
        </div>
    );
}
